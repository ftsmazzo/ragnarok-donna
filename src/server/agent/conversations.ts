import { and, desc, eq, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "../context/tenant";

export type ConversationListItem = {
  id: string;
  phoneE164: string;
  mode: "ai" | "human";
  clientId: string | null;
  clientName: string | null;
  lastMessageAt: Date | null;
  preview: string | null;
  agentName: string | null;
};

export async function listConversations(limit = 40): Promise<{
  rows: ConversationListItem[];
  agentReady: boolean;
  connectionStatus: string | null;
}> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [connection] = await db
    .select({
      status: schema.whatsappConnections.status,
    })
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.tenantId, tenant.id))
    .limit(1);

  const [profile] = await db
    .select({ id: schema.agentProfiles.id })
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, tenant.id),
        eq(schema.agentProfiles.isActive, true)
      )
    )
    .limit(1);

  const rows = await db
    .select({
      id: schema.conversations.id,
      phoneE164: schema.conversations.phoneE164,
      mode: schema.conversations.mode,
      clientId: schema.conversations.clientId,
      clientName: schema.clients.name,
      lastMessageAt: schema.conversations.lastMessageAt,
      agentName: schema.agentProfiles.displayName,
      preview: sql<string | null>`(
        select m.body from ${schema.messages} m
        where m.conversation_id = ${schema.conversations.id}
        order by m.created_at desc
        limit 1
      )`.as("preview"),
    })
    .from(schema.conversations)
    .leftJoin(schema.clients, eq(schema.conversations.clientId, schema.clients.id))
    .leftJoin(
      schema.agentProfiles,
      eq(schema.conversations.agentProfileId, schema.agentProfiles.id)
    )
    .where(eq(schema.conversations.tenantId, tenant.id))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(limit);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      phoneE164: r.phoneE164,
      mode: r.mode,
      clientId: r.clientId,
      clientName: r.clientName,
      lastMessageAt: r.lastMessageAt,
      preview: r.preview,
      agentName: r.agentName,
    })),
    agentReady: Boolean(profile),
    connectionStatus: connection?.status ?? null,
  };
}

export async function ensureDefaultAgentProfile(input: {
  tenantId: string;
  displayName?: string;
}) {
  const db = createDb();
  const [existing] = await db
    .select({ id: schema.agentProfiles.id })
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, input.tenantId),
        eq(schema.agentProfiles.isDefault, true)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const name = input.displayName?.trim() || "Donna";
  const [row] = await db
    .insert(schema.agentProfiles)
    .values({
      tenantId: input.tenantId,
      name: name.toLowerCase().replace(/\s+/g, "_").slice(0, 80),
      displayName: name,
      systemPrompt:
        `Você é ${name}, assistente da barbearia. ` +
        `Use apenas as tools disponíveis. Agendamentos vão para a agenda; ` +
        `serviços de atendimento vão para comandas. Peça handoff se o cliente quiser humano.`,
      toolsEnabled: [
        "get_unit_context",
        "find_client",
        "list_services",
        "list_slots",
        "book_appointment",
        "cancel_appointment",
        "open_order",
        "add_order_item",
        "list_followups",
        "handoff_human",
        "send_whatsapp",
      ],
      isDefault: true,
      isActive: true,
    })
    .returning({ id: schema.agentProfiles.id });
  return row.id;
}
