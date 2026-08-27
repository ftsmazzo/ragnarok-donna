import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
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
