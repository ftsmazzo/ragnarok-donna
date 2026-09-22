import {
  addToWaitlistForAgent,
  listWaitlistForAgent,
  promoteWaitlistOnCancel,
} from "./domain-waitlist";
import { suggestBookingAlternatives } from "./suggest-alternatives";
import { describeDate, resolveTemporalPhrase } from "./temporal";
import { extractSchedulingIntent } from "./scheduling-intent";
import { getConnectionForTenant, deliverWhatsAppText } from "./outbound";
import { dayBoundsSp } from "@/server/agenda/utils";
import { TOOL_CATALOG } from "./catalog";
import {
  formatHoursForAgent,
  readBusinessProfileFromSettings,
} from "./business-profile";
import type { AgentToolName, ToolResult } from "./types";
import { normalizePhone } from "@/server/clients/normalize";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  formatDateSp,
  formatTimeSp,
  parseDateSp,
  shiftDateSp,
  todaySp,
} from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import {
  bookAppointmentForAgent,
  cancelAppointmentForAgent,
  listFreeSlotsForTenant,
  rescheduleAppointmentForAgent,
} from "./domain-agenda";
import { isLockedStaffName } from "@/server/house-rules/defaults";
import {
  addOrderItemForAgent,
  listOpenOrdersForAgent,
  openOrderForAgent,
} from "./domain-orders";
import { resolveStaffLoyalty, tierFromVisitCount, policyForTier } from "./staff-loyalty";

const ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "confirmed", "arrived", "in_progress"] as const;

function isComboServiceName(name: string) {
  return /combo|corte\s*\+?\s*barba|barba\s*\+?\s*corte|corte\s*e\s*barba/i.test(name);
}

function weekdayLongSp(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
}

function weekdayIndexSp(dateStr: string): number {
  const label = parseDateSp(dateStr).toLocaleDateString("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[label] ?? 0;
}

/** Segunda→domingo da semana civil em America/Sao_Paulo. */
function weekBoundsSp(anchorDate = todaySp()) {
  const wd = weekdayIndexSp(anchorDate);
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  const fromDate = shiftDateSp(anchorDate, mondayOffset);
  const toDate = shiftDateSp(fromDate, 6);
  return { fromDate, toDate };
}

function serializeAppointment(r: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  serviceName: string | null;
  staffName: string | null;
}) {
  const date = formatDateSp(r.startsAt);
  const time = formatTimeSp(r.startsAt);
  const weekday = weekdayLongSp(r.startsAt);
  const dateBr = r.startsAt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return {
    id: r.id,
    date,
    dateBr,
    weekday,
    time,
    label: `${weekday}, ${dateBr} às ${time}`,
    status: r.status,
    serviceName: r.serviceName,
    staffName: r.staffName,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
  };
}

export function listToolDefinitions(enabled?: string[]) {
  if (!enabled?.length) return TOOL_CATALOG;
  const set = new Set(enabled);
  return TOOL_CATALOG.filter((t) => set.has(t.name));
}

export async function auditToolCall(input: {
  tenantId: string;
  conversationId?: string | null;
  agentProfileId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResult;
  durationMs?: number;
}) {
  const db = createDb();
  await db.insert(schema.agentToolCalls).values({
    tenantId: input.tenantId,
    conversationId: input.conversationId ?? null,
    agentProfileId: input.agentProfileId ?? null,
    toolName: input.toolName,
    input: input.args,
    output: input.result.data ?? { error: input.result.error },
    status: input.result.ok ? "ok" : "error",
    durationMs: input.durationMs ?? null,
  });
}

/**
 * Executa tool pelo nome. Implementações reais entram nas fases 6.3+.
 * Hoje: stubs seguros que não mutam domínio (exceto handoff quando wired).
 */
export async function executeTool(
  toolName: AgentToolName,
  ctx: {
    tenantId: string;
    conversationId?: string;
    agentProfileId?: string | null;
  },
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const started = Date.now();
  let result: ToolResult;

  try {
    switch (toolName) {
      case "get_unit_context": {
        const db = createDb();
        const [tenant] = await db
          .select({
            id: schema.tenants.id,
            name: schema.tenants.name,
            slug: schema.tenants.slug,
            timezone: schema.tenants.timezone,
            settings: schema.tenants.settings,
          })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, ctx.tenantId))
          .limit(1);
        const staff = await db
          .select({
            id: schema.staff.id,
            name: schema.staff.name,
            nickname: schema.staff.nickname,
          })
          .from(schema.staff)
          .where(
            and(
              eq(schema.staff.tenantId, ctx.tenantId),
              eq(schema.staff.isBookable, true),
              eq(schema.staff.isActive, true),
              isNull(schema.staff.deletedAt)
            )
          );
        const businessProfile = readBusinessProfileFromSettings(tenant?.settings) ?? null;
        result = {
          ok: true,
          data: {
            tenant: tenant
              ? { id: tenant.id, name: tenant.name, slug: tenant.slug, timezone: tenant.timezone }
              : null,
            bookableStaff: staff,
            businessProfile: businessProfile
              ? {
                  nome: businessProfile.nomeFantasia,
                  tagline: businessProfile.tagline,
                  slogan: businessProfile.slogan,
                  endereco: businessProfile.endereco.textoCompleto,
                  email: businessProfile.email,
                  horarios: formatHoursForAgent(businessProfile.horarios),
                  horariosDetalhe: businessProfile.horarios,
                  diferenciais: businessProfile.diferenciais,
                  sobre: businessProfile.sobre,
                  servicosSite: businessProfile.servicosSite,
                  redes: businessProfile.redes,
                  avaliacaoGoogle: businessProfile.avaliacaoGoogle,
                  desdeAno: businessProfile.desdeAno,
                  site: businessProfile.sourceUrl,
                  note: "Não informe WhatsApp do site antigo — o canal desta conversa já é o WhatsApp oficial.",
                }
              : null,
            branding: businessProfile?.brand ?? null,
            toolCatalogVersion: 1,
          },
        };
        break;
      }
      case "list_services": {
        const db = createDb();
        const q = String(args.query ?? args.q ?? "").trim();
        const rows = await db
          .select({
            id: schema.services.id,
            name: schema.services.name,
            durationMin: schema.services.durationMin,
            priceCents: schema.services.priceCents,
          })
          .from(schema.services)
          .where(
            and(
              eq(schema.services.tenantId, ctx.tenantId),
              eq(schema.services.isActive, true),
              eq(schema.services.bookableOnline, true),
              isNull(schema.services.deletedAt),
              q ? ilike(schema.services.name, `%${q}%`) : undefined
            )
          )
          .orderBy(asc(schema.services.name))
          .limit(40);
        result = {
          ok: true,
          data: {
            count: rows.length,
            services: rows.map((r) => ({
              ...r,
              priceLabel: formatMoney(r.priceCents),
            })),
          },
        };
        break;
      }
      case "list_products": {
        const db = createDb();
        const q = String(args.query ?? args.q ?? "").trim();
        const rows = await db
          .select({
            id: schema.products.id,
            name: schema.products.name,
            category: schema.products.category,
            brand: schema.products.brand,
            priceCents: schema.products.priceCents,
            stockQty: schema.products.stockQty,
          })
          .from(schema.products)
          .where(
            and(
              eq(schema.products.tenantId, ctx.tenantId),
              eq(schema.products.isActive, true),
              eq(schema.products.forSale, true),
              isNull(schema.products.deletedAt),
              q
                ? or(
                    ilike(schema.products.name, `%${q}%`),
                    ilike(schema.products.brand, `%${q}%`),
                    ilike(schema.products.category, `%${q}%`)
                  )
                : undefined
            )
          )
          .orderBy(asc(schema.products.name))
          .limit(40);
        result = {
          ok: true,
          data: {
            query: q || null,
            count: rows.length,
            products: rows.map((r) => ({
              id: r.id,
              name: r.name,
              brand: r.brand,
              category: r.category,
              priceCents: r.priceCents,
              priceLabel: formatMoney(r.priceCents),
              inStock: (r.stockQty ?? 0) > 0,
              stockQty: r.stockQty,
            })),
            instruction:
              "Responda com nome + priceLabel. Se count=0, diga que não achou no estoque de venda e ofereça chamar a equipe — não invente produto.",
          },
        };
        break;
      }
      case "list_client_appointments": {
        const clientId = String(args.clientId ?? "").trim();
        const phoneRaw = String(args.phoneE164 ?? "").trim();
        // Default: próximos (do agora em diante) — nunca puxar o mais longe como “o” horário.
        const range = String(args.range ?? "upcoming").toLowerCase();
        const beforeDate = String(args.beforeDate ?? "").trim();
        const afterDate = String(args.afterDate ?? "").trim();
        const onlyNearest = range === "next" || range === "proximo" || range === "próximo";
        const db = createDb();

        let resolvedClientId = clientId || null;
        if (!resolvedClientId && phoneRaw) {
          const digits = phoneRaw.replace(/\D/g, "");
          const last11 = (digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits).slice(-11);
          const e164 = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
          const [c] = await db
            .select({ id: schema.clients.id })
            .from(schema.clients)
            .where(
              and(
                eq(schema.clients.tenantId, ctx.tenantId),
                isNull(schema.clients.deletedAt),
                or(
                  eq(schema.clients.phoneE164, e164),
                  sql`right(regexp_replace(coalesce(${schema.clients.phoneE164}, ''), '\\D', '', 'g'), 11) = ${last11}`,
                  sql`right(regexp_replace(coalesce(${schema.clients.phone}, ''), '\\D', '', 'g'), 11) = ${last11}`
                )
              )
            )
            .limit(1);
          resolvedClientId = c?.id ?? null;
        }

        if (!resolvedClientId && ctx.conversationId) {
          const [conv] = await db
            .select({ clientId: schema.conversations.clientId })
            .from(schema.conversations)
            .where(eq(schema.conversations.id, ctx.conversationId))
            .limit(1);
          resolvedClientId = conv?.clientId ?? null;
        }

        if (!resolvedClientId) {
          result = { ok: true, data: { appointments: [], note: "cliente não identificado" } };
          break;
        }

        const today = todaySp();
        const now = new Date();
        let fromInstant: Date = now;
        let toInstant: Date = dayBoundsSp(shiftDateSp(today, 60)).end;
        let fromDate = today;
        let toDate = shiftDateSp(today, 60);

        if (range === "today" || range === "hoje") {
          const b = dayBoundsSp(today);
          fromInstant = now > b.start ? now : b.start;
          toInstant = b.end;
          fromDate = today;
          toDate = today;
        } else if (range === "week" || range === "essa_semana" || range === "semana") {
          const w = weekBoundsSp(today);
          fromInstant = dayBoundsSp(w.fromDate).start;
          toInstant = dayBoundsSp(w.toDate).end;
          fromDate = w.fromDate;
          toDate = w.toDate;
          if (fromInstant < now) fromInstant = now;
        } else if (onlyNearest || range === "upcoming" || range === "proximos" || range === "próximos") {
          fromInstant = now;
          toDate = shiftDateSp(today, onlyNearest ? 90 : 60);
          toInstant = dayBoundsSp(toDate).end;
          fromDate = today;
        } else if (range === "all" || range === "todos") {
          fromInstant = now;
          toDate = shiftDateSp(today, 120);
          toInstant = dayBoundsSp(toDate).end;
          fromDate = today;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
          // Exclusivo: tudo ANTES do início desse dia (SP)
          toInstant = new Date(`${beforeDate}T00:00:00-03:00`);
          toInstant = new Date(toInstant.getTime() - 1);
          toDate = formatDateSp(toInstant);
          fromInstant = now;
          if (fromInstant > toInstant) {
            fromInstant = dayBoundsSp(shiftDateSp(beforeDate, -90)).start;
          }
          fromDate = formatDateSp(fromInstant);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(afterDate)) {
          fromInstant = dayBoundsSp(afterDate).end;
          fromInstant = new Date(dayBoundsSp(afterDate).end.getTime() + 1);
          fromDate = afterDate;
        }

        const rows = await db
          .select({
            id: schema.appointments.id,
            startsAt: schema.appointments.startsAt,
            endsAt: schema.appointments.endsAt,
            status: schema.appointments.status,
            serviceName: schema.services.name,
            staffName: schema.staff.name,
          })
          .from(schema.appointments)
          .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
          .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
          .where(
            and(
              eq(schema.appointments.tenantId, ctx.tenantId),
              eq(schema.appointments.clientId, resolvedClientId),
              isNull(schema.appointments.deletedAt),
              inArray(schema.appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
              gte(schema.appointments.startsAt, fromInstant),
              lte(schema.appointments.startsAt, toInstant)
            )
          )
          .orderBy(asc(schema.appointments.startsAt))
          .limit(onlyNearest ? 1 : 30);

        const appointments = rows.map(serializeAppointment);
        const nearest = appointments[0] ?? null;

        result = {
          ok: true,
          data: {
            range,
            fromDate,
            toDate,
            orderedBy: "starts_at_asc_nearest_first",
            count: appointments.length,
            nearest,
            appointments,
            instruction:
              "Liste TODOS os itens de appointments na resposta (ou diga que não há). Use o campo label/weekday — nunca invente dia da semana. nearest = o mais próximo.",
          },
        };
        break;
      }
      case "find_client": {
        const phoneRaw = String(args.phoneE164 ?? args.phone ?? "").trim();
        const digits = phoneRaw.replace(/\D/g, "");
        if (digits.length < 10) {
          result = { ok: false, error: "phoneE164 obrigatório" };
          break;
        }
        const e164 = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
        const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
        const last11 = national.slice(-11);

        const db = createDb();
        const [client] = await db
          .select({
            id: schema.clients.id,
            name: schema.clients.name,
            phone: schema.clients.phone,
            phoneE164: schema.clients.phoneE164,
            notes: schema.clients.notes,
            preferences: schema.clients.preferences,
          })
          .from(schema.clients)
          .where(
            and(
              eq(schema.clients.tenantId, ctx.tenantId),
              isNull(schema.clients.deletedAt),
              or(
                eq(schema.clients.phoneE164, e164),
                sql`right(regexp_replace(coalesce(${schema.clients.phoneE164}, ''), '\\D', '', 'g'), 11) = ${last11}`,
                sql`right(regexp_replace(coalesce(${schema.clients.phone}, ''), '\\D', '', 'g'), 11) = ${last11}`
              )
            )
          )
          .limit(1);

        if (!client) {
          result = { ok: true, data: { found: false } };
          break;
        }

        if (ctx.conversationId) {
          await db
            .update(schema.conversations)
            .set({ clientId: client.id, updatedAt: new Date() })
            .where(
              and(
                eq(schema.conversations.id, ctx.conversationId),
                eq(schema.conversations.tenantId, ctx.tenantId)
              )
            );
        }

        const recentItems = await db
          .select({
            description: schema.orderItems.description,
            serviceName: schema.services.name,
            performedAt: schema.orderItems.performedAt,
            openedAt: schema.orders.openedAt,
            closedAt: schema.orders.closedAt,
            orderStatus: schema.orders.status,
            staffName: schema.staff.name,
          })
          .from(schema.orderItems)
          .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
          .leftJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
          .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
          .where(
            and(
              eq(schema.orders.tenantId, ctx.tenantId),
              eq(schema.orders.clientId, client.id),
              isNull(schema.orders.deletedAt),
              eq(schema.orderItems.itemType, "service")
            )
          )
          .orderBy(desc(sql`coalesce(${schema.orderItems.performedAt}, ${schema.orders.closedAt}, ${schema.orders.openedAt})`))
          .limit(25);

        const openOrder = await db
          .select({
            id: schema.orders.id,
            openedAt: schema.orders.openedAt,
            totalCents: schema.orders.totalCents,
          })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.tenantId, ctx.tenantId),
              eq(schema.orders.clientId, client.id),
              eq(schema.orders.status, "open"),
              isNull(schema.orders.deletedAt)
            )
          )
          .orderBy(desc(schema.orders.openedAt))
          .limit(1);

        const lastAppt = await db
          .select({
            id: schema.appointments.id,
            startsAt: schema.appointments.startsAt,
            endsAt: schema.appointments.endsAt,
            status: schema.appointments.status,
            serviceName: schema.services.name,
            staffName: schema.staff.name,
          })
          .from(schema.appointments)
          .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
          .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
          .where(
            and(
              eq(schema.appointments.tenantId, ctx.tenantId),
              eq(schema.appointments.clientId, client.id),
              isNull(schema.appointments.deletedAt),
              lt(schema.appointments.startsAt, new Date()),
              inArray(schema.appointments.status, [
                "scheduled",
                "confirmed",
                "arrived",
                "in_progress",
                "completed",
              ])
            )
          )
          .orderBy(desc(schema.appointments.startsAt))
          .limit(1);

        const upcomingRows = await db
          .select({
            id: schema.appointments.id,
            startsAt: schema.appointments.startsAt,
            endsAt: schema.appointments.endsAt,
            status: schema.appointments.status,
            serviceName: schema.services.name,
            staffName: schema.staff.name,
          })
          .from(schema.appointments)
          .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
          .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
          .where(
            and(
              eq(schema.appointments.tenantId, ctx.tenantId),
              eq(schema.appointments.clientId, client.id),
              isNull(schema.appointments.deletedAt),
              gte(schema.appointments.startsAt, new Date()),
              inArray(schema.appointments.status, [...ACTIVE_APPOINTMENT_STATUSES])
            )
          )
          .orderBy(asc(schema.appointments.startsAt))
          .limit(5);

        const upcoming = upcomingRows.map(serializeAppointment);
        const nextAppointment = upcoming[0] ?? null;

        function serializeHistoryMoment(input: {
          at: Date | null;
          serviceName: string;
          staffName?: string | null;
          source: "comanda" | "agenda";
        }) {
          if (!input.at) return null;
          const date = formatDateSp(input.at);
          const time = formatTimeSp(input.at);
          const weekday = weekdayLongSp(input.at);
          const dateBr = input.at.toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
          return {
            serviceName: input.serviceName,
            staffName: input.staffName ?? null,
            date,
            dateBr,
            weekday,
            time,
            label: `${weekday}, ${dateBr} às ${time}`,
            source: input.source,
            at: input.at.toISOString(),
          };
        }

        const recentServicesDated = recentItems
          .map((r) => {
            const name = (r.serviceName || r.description || "").trim();
            if (!name) return null;
            const at = r.performedAt ?? r.closedAt ?? r.openedAt;
            return serializeHistoryMoment({
              at,
              serviceName: name,
              staffName: r.staffName,
              source: "comanda",
            });
          })
          .filter(Boolean);

        // Também puxa agendas passadas (completed/confirmed no passado) como histórico datado
        const pastAppts = await db
          .select({
            startsAt: schema.appointments.startsAt,
            status: schema.appointments.status,
            serviceName: schema.services.name,
            staffName: schema.staff.name,
          })
          .from(schema.appointments)
          .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
          .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
          .where(
            and(
              eq(schema.appointments.tenantId, ctx.tenantId),
              eq(schema.appointments.clientId, client.id),
              isNull(schema.appointments.deletedAt),
              lt(schema.appointments.startsAt, new Date()),
              inArray(schema.appointments.status, ["completed", "confirmed", "scheduled", "arrived", "in_progress"])
            )
          )
          .orderBy(desc(schema.appointments.startsAt))
          .limit(15);

        for (const a of pastAppts) {
          const name = (a.serviceName || "").trim();
          if (!name) continue;
          const row = serializeHistoryMoment({
            at: a.startsAt,
            serviceName: name,
            staffName: a.staffName,
            source: "agenda",
          });
          if (row) recentServicesDated.push(row);
        }

        recentServicesDated.sort((a, b) => {
          const ta = a && "at" in a ? Date.parse(String(a.at)) : 0;
          const tb = b && "at" in b ? Date.parse(String(b.at)) : 0;
          return tb - ta;
        });

        const serviceQuery = String(args.serviceQuery ?? args.serviceName ?? "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{M}/gu, "");

        const matchesQuery = (name: string) => {
          const n = name
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{M}/gu, "");
          if (!serviceQuery) return true;
          const tokens = serviceQuery.split(/\s+/).filter((t) => t.length > 2);
          return tokens.length ? tokens.every((t) => n.includes(t)) : n.includes(serviceQuery);
        };

        const lastServiceMatch =
          recentServicesDated.find((r) => r && matchesQuery(r.serviceName)) ?? null;

        const serviceNames = recentServicesDated
          .map((r) => r?.serviceName ?? "")
          .filter(Boolean);
        const lastServiceName = serviceNames[0] ?? lastAppt[0]?.serviceName ?? null;
        const prefersCombo =
          serviceNames.slice(0, 5).some((n) => isComboServiceName(n)) ||
          (lastServiceName ? isComboServiceName(lastServiceName) : false);

        const firstName = client.name.trim().split(/\s+/)[0] || client.name;

        // Frequência real por barbeiro (agenda + comanda) — não só o preview recente
        const staffFromAppts = await db
          .select({
            staffId: schema.appointments.staffId,
            staffName: schema.staff.name,
            visitCount: count(),
          })
          .from(schema.appointments)
          .innerJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
          .where(
            and(
              eq(schema.appointments.tenantId, ctx.tenantId),
              eq(schema.appointments.clientId, client.id),
              isNull(schema.appointments.deletedAt),
              sql`${schema.appointments.staffId} is not null`,
              inArray(schema.appointments.status, [
                "completed",
                "arrived",
                "in_progress",
              ])
            )
          )
          .groupBy(schema.appointments.staffId, schema.staff.name)
          .orderBy(desc(count()))
          .limit(8);

        const staffFromOrders = await db
          .select({
            staffId: schema.orderItems.staffId,
            staffName: schema.staff.name,
            visitCount: count(),
          })
          .from(schema.orderItems)
          .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
          .innerJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
          .where(
            and(
              eq(schema.orders.tenantId, ctx.tenantId),
              eq(schema.orders.clientId, client.id),
              isNull(schema.orders.deletedAt),
              eq(schema.orderItems.itemType, "service"),
              sql`${schema.orderItems.staffId} is not null`
            )
          )
          .groupBy(schema.orderItems.staffId, schema.staff.name)
          .orderBy(desc(count()))
          .limit(8);

        const staffVisitMap = new Map<
          string,
          { staffId: string; staffName: string; visitCount: number }
        >();
        for (const row of [...staffFromAppts, ...staffFromOrders]) {
          if (!row.staffId) continue;
          const prev = staffVisitMap.get(row.staffId);
          const n = Number(row.visitCount ?? 0);
          if (!prev || n > prev.visitCount) {
            staffVisitMap.set(row.staffId, {
              staffId: row.staffId,
              staffName: row.staffName,
              visitCount: n,
            });
          }
        }
        const preferredStaff = [...staffVisitMap.values()]
          .map((s) => {
            const tier = tierFromVisitCount(s.visitCount);
            return {
              staffId: s.staffId,
              staffName: s.staffName,
              visitCount: s.visitCount,
              tier,
              policy: policyForTier(tier, s.staffName),
            };
          })
          .sort((a, b) => b.visitCount - a.visitCount)
          .slice(0, 5);
        const topStaff = preferredStaff[0] ?? null;

        result = {
          ok: true,
          data: {
            found: true,
            client: {
              id: client.id,
              name: client.name,
              firstName,
              phone: client.phone,
              phoneE164: client.phoneE164,
            },
            lastServiceName,
            prefersCombo,
            openOrder: openOrder[0] ?? null,
            nextAppointment,
            upcomingCount: upcoming.length,
            upcomingPreview: upcoming,
            lastAppointment: lastAppt[0]
              ? serializeAppointment({
                  id: lastAppt[0].id,
                  startsAt: lastAppt[0].startsAt,
                  endsAt: lastAppt[0].endsAt,
                  status: lastAppt[0].status,
                  serviceName: lastAppt[0].serviceName,
                  staffName: lastAppt[0].staffName,
                })
              : null,
            /** Histórico com DATA — use label/dateBr ao responder. */
            recentServices: recentServicesDated.slice(0, 12),
            /** Se serviceQuery foi passado, o match mais recente desse serviço. */
            lastServiceMatch,
            serviceQuery: serviceQuery || null,
            /** Fidelidade por barbeiro — use ao oferecer horários/alternativas. */
            preferredStaff,
            topStaff,
            note:
              "Para data de um serviço feito, use recentServices[].label ou lastServiceMatch. Se o cliente pedir um barbeiro, respeite preferredStaff[].policy (fiel ≥5 = só ele). Para agendas futuras use list_client_appointments.",
          },
        };
        break;
      }
      case "list_followups": {
        const { listFollowupsForAgent } = await import("@/server/insights");
        const limit = Math.min(30, Number(args.limit ?? 15) || 15);
        const perfil = await listFollowupsForAgent(ctx.tenantId, {
          inactiveDays:
            typeof args.inactiveDays === "number" ? args.inactiveDays : undefined,
          recurrenceDays:
            typeof args.recurrenceDays === "number" ? args.recurrenceDays : undefined,
          limit,
        });
        result = {
          ok: true,
          data: {
            inactive: perfil.inactiveClients.map((r) => ({
              clientId: r.clientId,
              clientName: r.clientName,
              phone: r.phone,
              daysSince: r.daysSince,
              lastServiceName: r.lastServiceName,
              lastAt: r.lastAt.toISOString(),
              reason: r.reason,
            })),
            recurrenceLapsed: perfil.recurrenceLapsed.map((r) => ({
              clientId: r.clientId,
              clientName: r.clientName,
              phone: r.phone,
              daysSince: r.daysSince,
              lastServiceName: r.lastServiceName,
              lastAt: r.lastAt.toISOString(),
              reason: r.reason,
            })),
            counts: {
              inactive: perfil.inactiveCount,
              recurrenceLapsed: perfil.recurrenceLapsedCount,
            },
            note:
              "Use estes clientes para follow-up WhatsApp. Não invente telefones. Para enviar, use send_whatsapp com phoneE164 e texto curto.",
          },
        };
        break;
      }
      case "list_slots": {
        const datePhrase = String(args.datePhrase ?? args.dayHint ?? "").trim();
        let date = String(args.date ?? "").trim();
        let resolvedMeta: ReturnType<typeof resolveTemporalPhrase> = null;
        let dateCorrected = false;

        // Preferir parse da frase; se divergir do date do LLM, a frase (com DD/MM) ganha.
        if (datePhrase) {
          resolvedMeta = resolveTemporalPhrase(datePhrase);
          if (resolvedMeta) {
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date !== resolvedMeta.date) {
              if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== resolvedMeta.date) {
                dateCorrected = true;
              }
              date = resolvedMeta.date;
            }
          }
        }
        // Rede de segurança: se ainda sem date, tenta intent da frase
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && datePhrase) {
          const intent = extractSchedulingIntent(datePhrase);
          if (intent.date) {
            date = intent.date;
            resolvedMeta = intent.resolved;
          }
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && datePhrase) {
          result = {
            ok: false,
            error: `Não entendi a data em "${datePhrase}". Peça DD/MM ou dia da semana (ex.: próxima segunda).`,
          };
          break;
        }
        const durationMin = Number(args.durationMin ?? 30);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          result = { ok: false, error: "date YYYY-MM-DD ou datePhrase obrigatório" };
          break;
        }
        const periodRaw = String(args.period ?? "").toLowerCase();
        const period =
          periodRaw === "tarde" || periodRaw === "manha" || periodRaw === "manhã"
            ? periodRaw.startsWith("tarde")
              ? "tarde"
              : "manha"
            : null;
        const preferredHour =
          args.preferredHour != null && Number.isFinite(Number(args.preferredHour))
            ? Number(args.preferredHour)
            : null;
        let staffIdFilter = String(args.staffId ?? args.staffName ?? "").trim() || null;
        let staffResolvedName: string | null = null;
        // Resolve nome → id (ex.: "Diego")
        if (staffIdFilter && !/^[0-9a-f-]{36}$/i.test(staffIdFilter)) {
          const dbStaff = createDb();
          const [st] = await dbStaff
            .select({ id: schema.staff.id, name: schema.staff.name })
            .from(schema.staff)
            .where(
              and(
                eq(schema.staff.tenantId, ctx.tenantId),
                eq(schema.staff.isActive, true),
                isNull(schema.staff.deletedAt),
                or(
                  ilike(schema.staff.name, `%${staffIdFilter}%`),
                  ilike(schema.staff.nickname, `%${staffIdFilter}%`)
                )
              )
            )
            .limit(1);
          staffResolvedName = st?.name ?? staffIdFilter;
          staffIdFilter = st?.id ?? null;
        }

        // Cliente da conversa (fidelidade)
        let clientIdForLoyalty: string | null =
          typeof args.clientId === "string" && /^[0-9a-f-]{36}$/i.test(args.clientId)
            ? args.clientId
            : null;
        if (!clientIdForLoyalty && ctx.conversationId) {
          const dbConv = createDb();
          const [conv] = await dbConv
            .select({ clientId: schema.conversations.clientId })
            .from(schema.conversations)
            .where(
              and(
                eq(schema.conversations.id, ctx.conversationId),
                eq(schema.conversations.tenantId, ctx.tenantId)
              )
            )
            .limit(1);
          clientIdForLoyalty = conv?.clientId ?? null;
        }

        const staffLoyalty =
          staffIdFilter && clientIdForLoyalty
            ? await resolveStaffLoyalty({
                tenantId: ctx.tenantId,
                clientId: clientIdForLoyalty,
                staffId: staffIdFilter,
                staffName: staffResolvedName,
              })
            : null;

        const slotLimit = staffLoyalty?.tier === "loyal" ? 5 : Number(args.limit ?? 8);
        let slots = await listFreeSlotsForTenant({
          tenantId: ctx.tenantId,
          date,
          durationMin: Number.isFinite(durationMin) ? durationMin : 30,
          period,
          limit: slotLimit,
          staffId: staffIdFilter,
        });
        // Fiel: só melhores horários do barbeiro (prioriza hora pedida / meio do dia)
        if (staffLoyalty?.tier === "loyal" && slots.length > 3) {
          const preferred = preferredHour;
          slots = [...slots]
            .sort((a, b) => {
              if (preferred != null) {
                const da = Math.abs(a.hour - preferred);
                const dbh = Math.abs(b.hour - preferred);
                if (da !== dbh) return da - dbh;
              }
              // Prefere 9–11 e 14–17
              const score = (h: number) =>
                (h >= 9 && h <= 11) || (h >= 14 && h <= 17) ? 0 : 1;
              const sa = score(a.hour);
              const sb = score(b.hour);
              if (sa !== sb) return sa - sb;
              return a.hour - b.hour || a.minute - b.minute;
            })
            .slice(0, 3);
        }

        const allowOtherStaff =
          !staffLoyalty || staffLoyalty.tier === "new" || staffLoyalty.tier === "familiar";

        // Slots de outros barbeiros no mesmo horário (só se NÃO for cliente fiel)
        const allDaySlots =
          preferredHour != null && staffIdFilter && allowOtherStaff
            ? await listFreeSlotsForTenant({
                tenantId: ctx.tenantId,
                date,
                durationMin: Number.isFinite(durationMin) ? durationMin : 30,
                period: null,
                limit: 12,
              })
            : slots;
        const preferredHourOccupied =
          preferredHour != null &&
          !slots.some((s) => s.hour === preferredHour || s.hour === preferredHour % 24);
        const staffDayFull = Boolean(staffIdFilter) && slots.length === 0;

        // Cliente fixou barbeiro e ele TEM horários: nunca diga "cheio" nem abra menu 1/2/3.
        const staffHasOtherSlots =
          Boolean(staffIdFilter) && slots.length > 0 && preferredHourOccupied;
        const needsAlternatives =
          (staffDayFull || (preferredHourOccupied && !staffHasOtherSlots)) &&
          staffLoyalty?.tier !== "loyal";
        const needsWaitlistPreferred =
          staffLoyalty?.tier === "loyal" &&
          (staffDayFull || (preferredHourOccupied && !staffHasOtherSlots));

        const alts = needsAlternatives
          ? await suggestBookingAlternatives({
              tenantId: ctx.tenantId,
              date,
              preferredHour,
              preferredStaffId: staffIdFilter,
              durationMin: Number.isFinite(durationMin) ? durationMin : 30,
            })
          : null;

        // Familiar (1–4): no máx. 3 opções combinadas
        const alternatives =
          staffLoyalty?.tier === "familiar"
            ? (alts?.alternatives ?? []).slice(0, 3)
            : (alts?.alternatives ?? []);

        const dateInfo = describeDate(date);
        result = {
          ok: true,
          data: {
            date,
            dateLabel: dateInfo.label,
            weekday: dateInfo.weekday,
            weekdayShort: dateInfo.weekdayShort,
            dateBr: dateInfo.dateBr,
            dateCorrected,
            period,
            preferredHour,
            preferredHourOccupied,
            staffDayFull,
            staffLoyalty,
            slots,
            otherStaffSameDay:
              preferredHour != null && allowOtherStaff
                ? allDaySlots
                    .filter(
                      (s) =>
                        s.hour === preferredHour &&
                        (!staffIdFilter || s.staffId !== staffIdFilter)
                    )
                    .slice(0, 3)
                : [],
            alternatives,
            instruction:
              "Fale ao cliente exatamente dateLabel/dateBr desta tool — NÃO invente outro dia. Só ofereça horários que estão em `slots` (respeitam bloqueios e jornada). Nunca invente buraco no almoço. Se slots.length>0, liste 2–3 e ofereça agendar — NÃO diga que está cheio.",
            ...(staffLoyalty
              ? {
                  loyaltyInstruction: staffLoyalty.policy,
                }
              : {}),
            ...(staffHasOtherSlots
              ? {
                  flowInstruction:
                    "A hora pedida desse profissional está ocupada, MAS ele tem outros horários livres em `slots`. Liste 2–3 desses horários DELE e pergunte qual fecha. NÃO diga que a agenda dele está cheia. NÃO abra menu 'outro barbeiro / outro dia' ainda.",
                }
              : {}),
            ...(resolvedMeta?.mismatchWeekday
              ? {
                  mismatchWeekday: true,
                  note: resolvedMeta.note,
                }
              : {}),
            ...(needsWaitlistPreferred
              ? {
                  waitlistPreferred: true,
                  offerWaitlistImmediately: true,
                  flowInstruction:
                    "Cliente FIEL deste barbeiro e o dia/hora não tem vaga. NÃO ofereça outro profissional. Ofereça imediatamente espera preferencial com ele (add_to_waitlist, notes com nome do barbeiro).",
                }
              : {}),
            ...(needsAlternatives
              ? {
                  waitlistOffer: false,
                  offerWaitlistOnlyAfterAlternatives: true,
                  flowInstruction:
                    staffLoyalty?.tier === "familiar"
                      ? "Cliente já veio 1–4 vezes com este barbeiro. Ofereça até 3 opções combinadas de `alternatives` (horários dele noutro dia e/ou outro barbeiro no período). Lista de espera preferencial só se recusar."
                      : staffDayFull
                        ? "Esse profissional realmente não tem horário livre nesse período/data (`staffDayFull`). Ofereça 2–3 itens de `alternatives` de forma curta. Lista de espera só se o cliente recusar."
                        : "OBRIGATÓRIO nesta ordem: (1) diga que o horário pedido não está livre; (2) ofereça 2–3 itens curtos de `alternatives`; (3) NÃO ofereça lista de espera ainda — só se o cliente recusar. Quando aceitar espera, chame add_to_waitlist (sem handoff_human).",
                }
              : !needsAlternatives &&
                  !needsWaitlistPreferred &&
                  !staffHasOtherSlots &&
                  slots.length > 0
                ? {
                    flowInstruction:
                      staffLoyalty?.tier === "loyal"
                        ? "Cliente fiel: liste só os 2–3 melhores horários DESTE barbeiro em `slots` e pergunte qual fecha. NÃO sugira outro profissional."
                        : "Há horários livres em `slots`. Seja direto: liste 2–3 (com o nome do barbeiro se houver) e pergunte qual fecha. NÃO invente menu de alternativas.",
                  }
                : {}),
          },
        };
        break;
      }
      case "resolve_date": {
        const phrase = String(args.phrase ?? args.datePhrase ?? args.text ?? "").trim();
        if (!phrase) {
          result = { ok: false, error: "phrase obrigatória (ex.: próxima segunda, amanhã, 1/9)" };
          break;
        }
        const intent = extractSchedulingIntent(phrase);
        const resolved = intent.resolved ?? resolveTemporalPhrase(phrase);
        if (!resolved) {
          result = {
            ok: false,
            error: `Não consegui interpretar "${phrase}". Peça confirmação (DD/MM ou dia da semana).`,
          };
          break;
        }
        result = {
          ok: true,
          data: {
            ...resolved,
            absoluteDatePresent: intent.absoluteDatePresent,
            instruction:
              "Use date (YYYY-MM-DD) em list_slots/book_appointment e fale exatamente label/dateBr ao cliente. Nunca troque por outro sábado/dia. Se mismatchWeekday, corrija o dia da semana.",
          },
        };
        break;
      }
      case "book_appointment": {
        const clientId = String(args.clientId ?? "");
        let staffId = String(args.staffId ?? "");
        const date = String(args.date ?? "");
        const hour = Number(args.hour);
        const minuteRaw = args.minute != null ? Number(args.minute) : 0;
        const minute = minuteRaw === 30 ? 30 : 0;
        const durationMin = Number(args.durationMin ?? 30);
        if (!clientId || !staffId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hour)) {
          result = { ok: false, error: "clientId, staffId, date e hour obrigatórios" };
          break;
        }
        const UUID_RE_BOOK =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!UUID_RE_BOOK.test(clientId) || !UUID_RE_BOOK.test(staffId)) {
          result = {
            ok: false,
            error:
              "clientId e staffId devem ser UUIDs (use find_client e list_slots — não invente ids)",
          };
          break;
        }

        const dbBook = createDb();
        const [staffRow] = await dbBook
          .select({ id: schema.staff.id, name: schema.staff.name })
          .from(schema.staff)
          .where(
            and(
              eq(schema.staff.id, staffId),
              eq(schema.staff.tenantId, ctx.tenantId),
              isNull(schema.staff.deletedAt)
            )
          )
          .limit(1);
        if (!staffRow) {
          result = { ok: false, error: "Profissional inválido" };
          break;
        }

        const requested = String(args.clientRequestedStaff ?? args.staffName ?? "")
          .toLowerCase()
          .trim();
        if (isLockedStaffName(staffRow.name)) {
          const staffNorm = staffRow.name.toLowerCase();
          const first = staffNorm.split(/\s+/)[0] ?? staffNorm;
          const clientAsked =
            requested.length >= 3 &&
            (staffNorm.includes(requested) ||
              requested.includes(first) ||
              first.includes(requested));
          if (!clientAsked && !args.allowLockedStaff) {
            result = {
              ok: false,
              error: `${staffRow.name} tem agenda restrita (carteira fechada). Só marque se o cliente pediu esse profissional pelo nome — confirme com ele ou ofereça outro barbeiro.`,
            };
            break;
          }
        }

        const booked = await bookAppointmentForAgent({
          tenantId: ctx.tenantId,
          clientId,
          staffId,
          serviceId: args.serviceId ? String(args.serviceId) : null,
          date,
          hour,
          minute,
          durationMin: Number.isFinite(durationMin) ? durationMin : 30,
          priceCents: typeof args.priceCents === "number" ? args.priceCents : null,
          notes: args.notes ? String(args.notes) : undefined,
        });
        result = booked.ok
          ? {
              ok: true,
              data: {
                appointmentId: booked.id,
                startsAt: booked.startsAt.toISOString(),
                endsAt: booked.endsAt.toISOString(),
                hour,
                minute,
                ...describeDate(date),
                confirmationHint:
                  "Confirme UMA vez com label (weekday real). Não peça telefone de novo se já tem. Se o cliente só agradecer depois, não reenvie a confirmação.",
              },
            }
          : { ok: false, error: booked.error };
        break;
      }
      case "cancel_appointment": {
        const appointmentId = String(args.appointmentId ?? "");
        if (!appointmentId) {
          result = { ok: false, error: "appointmentId obrigatório" };
          break;
        }
        const dbCancel = createDb();
        const [apptBefore] = await dbCancel
          .select({
            id: schema.appointments.id,
            staffId: schema.appointments.staffId,
            serviceId: schema.appointments.serviceId,
            startsAt: schema.appointments.startsAt,
          })
          .from(schema.appointments)
          .where(
            and(
              eq(schema.appointments.id, appointmentId),
              eq(schema.appointments.tenantId, ctx.tenantId)
            )
          )
          .limit(1);

        const cancelled = await cancelAppointmentForAgent({
          tenantId: ctx.tenantId,
          appointmentId,
        });
        if (!cancelled.ok) {
          result = { ok: false, error: cancelled.error };
          break;
        }

        let waitlistNote: string | undefined;
        if (apptBefore?.startsAt) {
          const promo = await promoteWaitlistOnCancel({
            tenantId: ctx.tenantId,
            staffId: apptBefore.staffId,
            serviceId: apptBefore.serviceId,
            startsAt: apptBefore.startsAt,
          });
          if (promo.promoted) {
            waitlistNote = promo.error
              ? `Lista de espera notificada (aviso: ${promo.error})`
              : "Primeiro da lista de espera avisado no WhatsApp";
          }
        }

        result = { ok: true, data: { appointmentId, waitlistNote } };
        break;
      }
      case "reschedule_appointment": {
        const appointmentId = String(args.appointmentId ?? "").trim();
        const staffId = String(args.staffId ?? "").trim();
        const date = String(args.date ?? "").trim();
        const hour = Number(args.hour);
        const minute = Number(args.minute) === 30 ? 30 : 0;
        const durationMin = Number(args.durationMin ?? 30);
        if (!appointmentId || !staffId || !date || !Number.isFinite(hour)) {
          result = {
            ok: false,
            error: "appointmentId, staffId, date e hour são obrigatórios",
          };
          break;
        }
        const UUID_RE =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!UUID_RE.test(appointmentId) || !UUID_RE.test(staffId)) {
          result = {
            ok: false,
            error: "appointmentId e staffId devem ser UUIDs válidos (use list_client_appointments / list_slots)",
          };
          break;
        }
        const moved = await rescheduleAppointmentForAgent({
          tenantId: ctx.tenantId,
          appointmentId,
          staffId,
          serviceId: args.serviceId ? String(args.serviceId) : undefined,
          date,
          hour,
          minute,
          durationMin: Number.isFinite(durationMin) ? durationMin : 30,
          priceCents: typeof args.priceCents === "number" ? args.priceCents : null,
          notes: args.notes ? String(args.notes) : undefined,
        });
        result = moved.ok
          ? {
              ok: true,
              data: {
                appointmentId: moved.id,
                cancelledId: moved.cancelledId,
                startsAt: moved.startsAt.toISOString(),
                endsAt: moved.endsAt.toISOString(),
                hour,
                minute,
                ...describeDate(date),
                confirmationHint:
                  "Confirme UMA vez o novo horário com label. Não reenvie se o cliente só agradecer.",
              },
            }
          : { ok: false, error: moved.error };
        break;
      }
      case "open_order": {
        const opened = await openOrderForAgent({
          tenantId: ctx.tenantId,
          clientId: String(args.clientId ?? "").trim() || undefined,
          appointmentId: String(args.appointmentId ?? "").trim() || undefined,
          notes: String(args.notes ?? "").trim() || undefined,
        });
        result = opened.ok
          ? { ok: true, data: { orderId: opened.id } }
          : { ok: false, error: opened.error };
        break;
      }
      case "add_order_item": {
        const orderId = String(args.orderId ?? "").trim();
        const itemTypeRaw = String(args.itemType ?? "").trim().toLowerCase();
        const catalogId = String(
          args.catalogId ?? args.serviceId ?? args.productId ?? ""
        ).trim();
        let itemType: "service" | "product" | null =
          itemTypeRaw === "product" || itemTypeRaw === "service"
            ? itemTypeRaw
            : args.productId
              ? "product"
              : args.serviceId
                ? "service"
                : null;
        if (!orderId || !catalogId || !itemType) {
          result = {
            ok: false,
            error: "orderId, itemType (service|product) e catalogId são obrigatórios",
          };
          break;
        }
        const added = await addOrderItemForAgent({
          tenantId: ctx.tenantId,
          orderId,
          itemType,
          catalogId,
          staffId: String(args.staffId ?? "").trim() || undefined,
          qty: args.qty != null ? Number(args.qty) : 1,
        });
        result = added.ok
          ? {
              ok: true,
              data: {
                itemId: added.id,
                orderTotalCents: added.totalCents,
                orderTotalLabel: formatMoney(added.totalCents),
              },
            }
          : { ok: false, error: added.error };
        break;
      }
      case "list_open_orders": {
        const listed = await listOpenOrdersForAgent({
          tenantId: ctx.tenantId,
          phoneE164: String(args.phoneE164 ?? args.phone ?? "").trim() || undefined,
          clientId: String(args.clientId ?? "").trim() || undefined,
          limit: args.limit != null ? Number(args.limit) : 20,
        });
        result = { ok: true, data: listed };
        break;
      }
      case "add_to_waitlist": {
        const addedWl = await addToWaitlistForAgent({
          tenantId: ctx.tenantId,
          clientId: String(args.clientId ?? "").trim() || undefined,
          phone: String(args.phone ?? args.phoneE164 ?? "").trim() || undefined,
          staffId: String(args.staffId ?? "").trim() || undefined,
          serviceId: String(args.serviceId ?? "").trim() || undefined,
          desiredDate: String(args.desiredDate ?? "").trim() || undefined,
          notes: String(args.notes ?? "").trim() || undefined,
        });
        result = addedWl.ok
          ? { ok: true, data: { waitlistId: addedWl.id, status: "waiting" } }
          : { ok: false, error: addedWl.error };
        break;
      }
      case "list_waitlist": {
        const statusRaw = String(args.status ?? "waiting").trim();
        const status =
          statusRaw === "notified" || statusRaw === "all" || statusRaw === "waiting"
            ? statusRaw
            : "waiting";
        const listedWl = await listWaitlistForAgent({
          tenantId: ctx.tenantId,
          status,
          limit: args.limit != null ? Number(args.limit) : 15,
        });
        result = { ok: true, data: listedWl };
        break;
      }
      case "send_whatsapp": {
        const phoneRaw = String(args.phoneE164 ?? args.phone ?? "").trim();
        const text = String(args.text ?? "").trim();
        if (!phoneRaw || !text) {
          result = { ok: false, error: "phoneE164 e text são obrigatórios" };
          break;
        }
        const { phoneE164 } = normalizePhone(phoneRaw);
        if (!phoneE164) {
          result = { ok: false, error: "Telefone inválido" };
          break;
        }
        const conn = await getConnectionForTenant(ctx.tenantId);
        if (!conn?.instanceName || conn.status !== "connected") {
          result = { ok: false, error: "WhatsApp da unidade desconectado" };
          break;
        }
        const dbSend = createDb();
        let conversationId = ctx.conversationId;
        if (!conversationId) {
          const [existing] = await dbSend
            .select({ id: schema.conversations.id })
            .from(schema.conversations)
            .where(
              and(
                eq(schema.conversations.tenantId, ctx.tenantId),
                eq(schema.conversations.phoneE164, phoneE164)
              )
            )
            .limit(1);
          if (existing) {
            conversationId = existing.id;
          } else {
            const [created] = await dbSend
              .insert(schema.conversations)
              .values({
                tenantId: ctx.tenantId,
                phoneE164,
                mode: "ai",
                agentProfileId: ctx.agentProfileId ?? null,
              })
              .returning({ id: schema.conversations.id });
            conversationId = created.id;
          }
        }
        const sent = await deliverWhatsAppText({
          tenantId: ctx.tenantId,
          instanceName: conn.instanceName,
          phoneE164,
          text,
          conversationId,
          direction: "outbound_ai",
        });
        result = sent.ok
          ? { ok: true, data: { messageId: sent.messageId, conversationId } }
          : { ok: false, error: sent.error };
        break;
      }
      case "handoff_human": {
        if (!ctx.conversationId) {
          result = { ok: false, error: "conversationId obrigatório" };
          break;
        }
        const db = createDb();
        const now = new Date();
        const [conv] = await db
          .select({
            phoneE164: schema.conversations.phoneE164,
            clientId: schema.conversations.clientId,
          })
          .from(schema.conversations)
          .where(
            and(
              eq(schema.conversations.id, ctx.conversationId),
              eq(schema.conversations.tenantId, ctx.tenantId)
            )
          )
          .limit(1);

        let clientName: string | null = null;
        if (conv?.clientId) {
          const [cli] = await db
            .select({ name: schema.clients.name })
            .from(schema.clients)
            .where(eq(schema.clients.id, conv.clientId))
            .limit(1);
          clientName = cli?.name ?? null;
        }

        await db
          .update(schema.conversations)
          .set({
            mode: "human",
            humanRequestedAt: now,
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.conversations.id, ctx.conversationId),
              eq(schema.conversations.tenantId, ctx.tenantId)
            )
          );
        await db.insert(schema.messages).values({
          tenantId: ctx.tenantId,
          conversationId: ctx.conversationId,
          direction: "system",
          body: "Cliente pediu atendimento humano — aguardando recepção.",
        });

        const { notifyHandoffRequest } = await import("./handoff-notify");
        const notify = await notifyHandoffRequest({
          tenantId: ctx.tenantId,
          conversationId: ctx.conversationId,
          clientPhoneE164: conv?.phoneE164 ?? null,
          clientName,
        });

        result = {
          ok: true,
          data: {
            mode: "human",
            staffNotified: notify.ok ? notify.notified : false,
            notifyNote: notify.ok
              ? notify.notified
                ? "Equipe avisada no WhatsApp configurado"
                : "Sem telefone de alerta configurado — avise a recepção pelo painel"
              : `Handoff ok; alerta falhou: ${notify.error}`,
          },
        };
        break;
      }
      default:
        result = {
          ok: false,
          error: `Tool ${toolName} ainda não implementada (scaffold 6.0)`,
        };
    }
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : "Erro na tool",
    };
  }

  await auditToolCall({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    agentProfileId: ctx.agentProfileId,
    toolName,
    args,
    result,
    durationMs: Date.now() - started,
  });

  return result;
}
