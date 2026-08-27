import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { TOOL_CATALOG } from "./catalog";
import type { AgentToolName, ToolResult } from "./types";

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
