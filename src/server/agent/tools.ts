import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  bookAppointmentForAgent,
  cancelAppointmentForAgent,
  listFreeSlotsForTenant,
} from "./domain-agenda";
import { dayBoundsSp } from "@/server/agenda/utils";
import { TOOL_CATALOG } from "./catalog";
import type { AgentToolName, ToolResult } from "./types";

function isComboServiceName(name: string) {
  return /combo|corte\s*\+?\s*barba|barba\s*\+?\s*corte|corte\s*e\s*barba/i.test(name);
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
        const range = String(args.range ?? "week").toLowerCase(); // today | week | upcoming
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
                  sql`right(regexp_replace(coalesce(${schema.clients.phoneE164}, ''), '\\D', '', 'g'), 11) = ${last11}`
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

        const fmt = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const today = fmt.format(new Date());
        let fromDate = today;
        let toDate = today;

        if (range === "week" || range === "essa_semana" || range === "semana") {
          // segunda → domingo da semana atual (SP)
          const wdFmt = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Sao_Paulo",
            weekday: "short",
          });
          const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const todayWd = map[wdFmt.format(new Date())] ?? new Date().getDay();
          const mondayOffset = todayWd === 0 ? -6 : 1 - todayWd;
          const monday = new Date(Date.now() + mondayOffset * 86_400_000);
          const sunday = new Date(monday.getTime() + 6 * 86_400_000);
          fromDate = fmt.format(monday);
          toDate = fmt.format(sunday);
        } else if (range === "upcoming" || range === "proximos") {
          const end = new Date(Date.now() + 14 * 86_400_000);
          toDate = fmt.format(end);
        }

        const { start } = dayBoundsSp(fromDate);
        const { end } = dayBoundsSp(toDate);

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
              gte(schema.appointments.startsAt, start),
              lte(schema.appointments.startsAt, end)
            )
          )
          .orderBy(asc(schema.appointments.startsAt))
          .limit(20);

        const appointments = rows.map((r) => ({
          id: r.id,
          when: r.startsAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          status: r.status,
          serviceName: r.serviceName,
          staffName: r.staffName,
        }));

        result = {
          ok: true,
          data: { range, fromDate, toDate, count: appointments.length, appointments },
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
            orderStatus: schema.orders.status,
          })
          .from(schema.orderItems)
          .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
          .leftJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
          .where(
            and(
              eq(schema.orders.tenantId, ctx.tenantId),
              eq(schema.orders.clientId, client.id),
              isNull(schema.orders.deletedAt),
              eq(schema.orderItems.itemType, "service")
            )
          )
          .orderBy(desc(sql`coalesce(${schema.orderItems.performedAt}, ${schema.orders.openedAt})`))
          .limit(8);

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
              isNull(schema.appointments.deletedAt)
            )
          )
          .orderBy(desc(schema.appointments.startsAt))
          .limit(1);

        const serviceNames = recentItems
          .map((r) => r.serviceName || r.description || "")
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
            lastAppointment: lastAppt[0]
              ? {
                  startsAt: lastAppt[0].startsAt,
                  status: lastAppt[0].status,
                  serviceName: lastAppt[0].serviceName,
                  staffName: lastAppt[0].staffName,
                }
              : null,
            recentServices: serviceNames.slice(0, 5),
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
