import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  formatDateSp,
  formatTimeSp,
  parseDateSp,
  shiftDateSp,
  todaySp,
} from "@/lib/datetime";
import {
  bookAppointmentForAgent,
  cancelAppointmentForAgent,
  listFreeSlotsForTenant,
} from "./domain-agenda";
import { dayBoundsSp } from "@/server/agenda/utils";
import { TOOL_CATALOG } from "./catalog";
import type { AgentToolName, ToolResult } from "./types";

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
        result = {
          ok: true,
          data: {
            tenant: tenant ?? null,
            bookableStaff: staff,
            toolCatalogVersion: 1,
          },
        };
        break;
      }
      case "list_services": {
        const db = createDb();
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
              isNull(schema.services.deletedAt)
            )
          )
          .limit(40);
        result = { ok: true, data: { services: rows } };
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
            note:
              "Para data de um serviço feito, use recentServices[].label ou lastServiceMatch. Para agendas futuras use list_client_appointments.",
          },
        };
        break;
      }
      case "list_followups": {
        result = {
          ok: true,
          data: {
            note: "list_followups wired na fase 6.4 — use /relatorios/perfil hoje",
            args,
          },
        };
        break;
      }
      case "list_slots": {
        const date = String(args.date ?? "").trim();
        const durationMin = Number(args.durationMin ?? 30);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          result = { ok: false, error: "date YYYY-MM-DD obrigatório" };
          break;
        }
        const periodRaw = String(args.period ?? "").toLowerCase();
        const period =
          periodRaw === "tarde" || periodRaw === "manha" || periodRaw === "manhã"
            ? periodRaw.startsWith("tarde")
              ? "tarde"
              : "manha"
            : null;
        const slots = await listFreeSlotsForTenant({
          tenantId: ctx.tenantId,
          date,
          durationMin: Number.isFinite(durationMin) ? durationMin : 30,
          period,
          limit: Number(args.limit ?? 5),
        });
        result = { ok: true, data: { date, period, slots } };
        break;
      }
      case "book_appointment": {
        const clientId = String(args.clientId ?? "");
        const staffId = String(args.staffId ?? "");
        const date = String(args.date ?? "");
        const hour = Number(args.hour);
        const durationMin = Number(args.durationMin ?? 30);
        if (!clientId || !staffId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hour)) {
          result = { ok: false, error: "clientId, staffId, date e hour obrigatórios" };
          break;
        }
        const booked = await bookAppointmentForAgent({
          tenantId: ctx.tenantId,
          clientId,
          staffId,
          serviceId: args.serviceId ? String(args.serviceId) : null,
          date,
          hour,
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
        const cancelled = await cancelAppointmentForAgent({
          tenantId: ctx.tenantId,
          appointmentId,
        });
        result = cancelled.ok
          ? { ok: true, data: { appointmentId } }
          : { ok: false, error: cancelled.error };
        break;
      }
      case "handoff_human": {
        if (!ctx.conversationId) {
          result = { ok: false, error: "conversationId obrigatório" };
          break;
        }
        const db = createDb();
        const now = new Date();
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
        result = { ok: true, data: { mode: "human" } };
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
