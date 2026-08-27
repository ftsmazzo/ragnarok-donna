import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { phoneFromJid } from "@/server/evolution/phone";
import { mapConnectionStatus } from "@/server/evolution/client";
import { resolveTenantByInstance, syncWhatsAppConnectionByInstance } from "./connection";
import { ensureDefaultAgentProfile } from "./conversations";
import { deliverWhatsAppText } from "./outbound";
import { runOrchestrator } from "./orchestrator";

type EvolutionWebhookBody = {
  event?: string;
  instance?: string;
  data?: unknown;
  sender?: string;
  apikey?: string;
};

type MessageUpsertData = {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
  };
  pushName?: string;
};

type ConnectionUpdateData = {
  state?: string;
  status?: string;
  instance?: { state?: string; status?: string };
};

function normalizeEvent(event: string | undefined) {
  return (event ?? "").toLowerCase().replace(/_/g, ".");
}

function extractMessageText(data: MessageUpsertData): string | null {
  const m = data.message;
  if (!m) return null;
  const text =
    m.conversation?.trim() ||
    m.extendedTextMessage?.text?.trim() ||
    m.imageMessage?.caption?.trim() ||
    "";
  return text || null;
}

function isGroupJid(jid: string) {
  return jid.includes("@g.us") || jid.includes("@broadcast");
}

async function findClientId(tenantId: string, phoneE164: string) {
  const db = createDb();
  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(
      and(eq(schema.clients.tenantId, tenantId), eq(schema.clients.phoneE164, phoneE164))
    )
    .limit(1);
  return client?.id ?? null;
}

async function ensureConversation(input: {
  tenantId: string;
  phoneE164: string;
  agentProfileId: string;
  clientId: string | null;
}) {
  const db = createDb();
  const [existing] = await db
    .select({ id: schema.conversations.id, mode: schema.conversations.mode })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.tenantId, input.tenantId),
        eq(schema.conversations.phoneE164, input.phoneE164)
      )
    )
    .limit(1);

  if (existing) {
    if (input.clientId) {
      await db
        .update(schema.conversations)
        .set({ clientId: input.clientId, updatedAt: new Date() })
        .where(eq(schema.conversations.id, existing.id));
    }
    return existing;
  }

  const [row] = await db
    .insert(schema.conversations)
    .values({
      tenantId: input.tenantId,
      phoneE164: input.phoneE164,
      clientId: input.clientId,
      mode: "ai",
      agentProfileId: input.agentProfileId,
    })
    .returning({ id: schema.conversations.id, mode: schema.conversations.mode });
  return row;
}

async function persistInbound(input: {
  tenantId: string;
  conversationId: string;
  body: string;
  waMessageId: string;
}) {
  const db = createDb();
  const now = new Date();

  try {
    await db.insert(schema.messages).values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: "inbound",
      body: input.body,
      waMessageId: input.waMessageId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) return false;
    throw err;
  }

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(schema.conversations.id, input.conversationId));

  return true;
}

async function handleMessageUpsert(instanceName: string, raw: MessageUpsertData) {
  const tenantLink = await resolveTenantByInstance(instanceName);
  if (!tenantLink) {
    console.warn("[webhook] instância sem tenant:", instanceName);
    return;
  }

  const jid = raw.key?.remoteJid ?? "";
  if (!jid || isGroupJid(jid) || raw.key?.fromMe) return;

  const phoneE164 = phoneFromJid(jid);
  if (!phoneE164) return;

  const text = extractMessageText(raw);
  if (!text) return;

  const waMessageId = raw.key?.id;
  if (!waMessageId) return;

  const tenantId = tenantLink.tenantId;
  const profileId = await ensureDefaultAgentProfile({ tenantId, displayName: "Donna" });
  const clientId = await findClientId(tenantId, phoneE164);
  const conv = await ensureConversation({
    tenantId,
    phoneE164,
    agentProfileId: profileId,
    clientId,
  });

  const inserted = await persistInbound({
    tenantId,
    conversationId: conv.id,
    body: text,
    waMessageId,
  });
  if (!inserted) return;

  if (conv.mode === "human") return;

  const result = await runOrchestrator({
    tenantId,
    conversationId: conv.id,
    phoneE164,
    userText: text,
    mode: "ai",
  });

  if (!result.reply?.trim()) return;

  const connection = await syncWhatsAppConnectionByInstance(instanceName);
  if (connection?.status !== "connected") return;

  await deliverWhatsAppText({
    tenantId,
    instanceName,
    phoneE164,
    text: result.reply,
    conversationId: conv.id,
    direction: "outbound_ai",
  });
}

async function handleConnectionUpdate(instanceName: string, raw: ConnectionUpdateData) {
  const state = raw.state ?? raw.status ?? raw.instance?.state ?? raw.instance?.status;
  const status = mapConnectionStatus(state);
  await syncWhatsAppConnectionByInstance(instanceName);

  const db = createDb();
  await db
    .update(schema.whatsappConnections)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.whatsappConnections.instanceName, instanceName));
}

export function assertWebhookAuthorized(request: Request, body: EvolutionWebhookBody) {
  const expectedSecret = process.env.AGENT_WEBHOOK_SECRET?.trim();
  const expectedApiKey = process.env.EVOLUTION_API_KEY?.trim();

  if (expectedSecret) {
    const url = new URL(request.url);
    const q = url.searchParams.get("secret");
    const h = request.headers.get("x-webhook-secret");
    if (q !== expectedSecret && h !== expectedSecret) {
      throw new Error("Unauthorized webhook");
    }
  }

  if (expectedApiKey && body.apikey && body.apikey !== expectedApiKey) {
    throw new Error("Unauthorized webhook apikey");
  }
}

export async function handleEvolutionWebhook(body: EvolutionWebhookBody) {
  const instanceName = body.instance?.trim();
  if (!instanceName) return { ok: true, skipped: "no_instance" };

  const event = normalizeEvent(body.event);

  if (event === "messages.upsert") {
    const payload = body.data;
    const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
    for (const item of items) {
      await handleMessageUpsert(instanceName, item as MessageUpsertData);
    }
    return { ok: true, handled: "messages.upsert", count: items.length };
  }

  if (event === "connection.update") {
    await handleConnectionUpdate(instanceName, (body.data ?? {}) as ConnectionUpdateData);
    return { ok: true, handled: "connection.update" };
  }

  if (event === "qrcode.updated") {
    await syncWhatsAppConnectionByInstance(instanceName);
    return { ok: true, handled: "qrcode.updated" };
  }

  return { ok: true, skipped: event || "unknown" };
}
