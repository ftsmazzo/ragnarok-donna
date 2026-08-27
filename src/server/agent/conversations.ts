import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { NotFoundError } from "../errors";
import { requireTenantContext } from "../context/tenant";

export type ConversationFilter = "todas" | "ai" | "human";

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

export type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound_ai" | "outbound_human" | "system";
  body: string;
  createdAt: Date;
  operatorName: string | null;
};

export type ConversationDetail = {
  id: string;
  phoneE164: string;
  mode: "ai" | "human";
  clientId: string | null;
  clientName: string | null;
  agentName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  lastMessageAt: Date | null;
  humanRequestedAt: Date | null;
  humanTakenAt: Date | null;
  humanReturnedAt: Date | null;
  messages: ConversationMessage[];
};

export async function listConversations(input?: {
  filter?: ConversationFilter;
  limit?: number;
}): Promise<{
  rows: ConversationListItem[];
  agentReady: boolean;
  connectionStatus: string | null;
  filter: ConversationFilter;
}> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const filter = input?.filter ?? "todas";
  const limit = input?.limit ?? 40;

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

  const conditions = [eq(schema.conversations.tenantId, tenant.id)];
  if (filter === "ai" || filter === "human") {
    conditions.push(eq(schema.conversations.mode, filter));
  }

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
    .where(and(...conditions))
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
    filter,
  };
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [row] = await db
    .select({
      id: schema.conversations.id,
      phoneE164: schema.conversations.phoneE164,
      mode: schema.conversations.mode,
      clientId: schema.conversations.clientId,
      clientName: schema.clients.name,
      agentName: schema.agentProfiles.displayName,
      assignedUserId: schema.conversations.assignedUserId,
      assignedUserName: schema.users.name,
      lastMessageAt: schema.conversations.lastMessageAt,
      humanRequestedAt: schema.conversations.humanRequestedAt,
      humanTakenAt: schema.conversations.humanTakenAt,
      humanReturnedAt: schema.conversations.humanReturnedAt,
    })
    .from(schema.conversations)
    .leftJoin(schema.clients, eq(schema.conversations.clientId, schema.clients.id))
    .leftJoin(
      schema.agentProfiles,
      eq(schema.conversations.agentProfileId, schema.agentProfiles.id)
    )
    .leftJoin(schema.users, eq(schema.conversations.assignedUserId, schema.users.id))
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.tenantId, tenant.id)
      )
    )
    .limit(1);

  if (!row) throw new NotFoundError("Conversa não encontrada");

  const messages = await db
    .select({
      id: schema.messages.id,
      direction: schema.messages.direction,
      body: schema.messages.body,
      createdAt: schema.messages.createdAt,
      operatorName: schema.users.name,
    })
    .from(schema.messages)
    .leftJoin(schema.users, eq(schema.messages.operatorUserId, schema.users.id))
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.tenantId, tenant.id)
      )
    )
    .orderBy(asc(schema.messages.createdAt))
    .limit(200);

  return {
    id: row.id,
    phoneE164: row.phoneE164,
    mode: row.mode,
    clientId: row.clientId,
    clientName: row.clientName,
    agentName: row.agentName,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUserName,
    lastMessageAt: row.lastMessageAt,
    humanRequestedAt: row.humanRequestedAt,
    humanTakenAt: row.humanTakenAt,
    humanReturnedAt: row.humanReturnedAt,
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt,
      operatorName: m.operatorName,
    })),
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
