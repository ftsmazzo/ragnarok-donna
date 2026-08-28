import { and, eq, gte, ne } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { phoneFromMessageKey } from "@/server/evolution/phone";
import { findRecentMessages, mapConnectionStatus } from "@/server/evolution/client";
import { resolveTenantByInstance, syncWhatsAppConnectionByInstance } from "./connection";
import { ensureDefaultAgentProfile } from "./persona-profile";
import { deliverWhatsAppText } from "./outbound";
import { runOrchestrator } from "./orchestrator";
import { enrichInboundMessage } from "./media";

type EvolutionWebhookBody = {
  event?: string;
  instance?: string;
  data?: unknown;
  sender?: string;
  apikey?: string;
};

export type MessageUpsertData = {
  key?: {
    remoteJid?: string;
    remoteJidAlt?: string;
    participant?: string;
    participantAlt?: string;
    fromMe?: boolean;
    id?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string; mimetype?: string };
    audioMessage?: { mimetype?: string; ptt?: boolean };
    videoMessage?: { caption?: string; mimetype?: string };
    documentMessage?: { caption?: string; fileName?: string; mimetype?: string };
  };
  pushName?: string;
  messageType?: string;
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
    m.videoMessage?.caption?.trim() ||
    m.documentMessage?.caption?.trim() ||
    "";
  return text || null;
}

function isGroupJid(jid: string) {
  return jid.includes("@g.us") || jid.includes("@broadcast") || jid.startsWith("status@");
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
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
}) {
  const db = createDb();
  const jidMeta: Record<string, string> = {};
  if (input.remoteJid?.includes("@lid")) jidMeta.remoteJidLid = input.remoteJid;
  if (input.remoteJidAlt) jidMeta.remoteJidAlt = input.remoteJidAlt;
  else if (input.remoteJid && !input.remoteJid.includes("@lid")) {
    jidMeta.remoteJidAlt = input.remoteJid;
  }

  const [existing] = await db
    .select({
      id: schema.conversations.id,
      mode: schema.conversations.mode,
      meta: schema.conversations.meta,
    })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.tenantId, input.tenantId),
        eq(schema.conversations.phoneE164, input.phoneE164)
      )
    )
    .limit(1);

  if (existing) {
    const nextMeta = { ...(existing.meta ?? {}), ...jidMeta };
    await db
      .update(schema.conversations)
      .set({
        clientId: input.clientId ?? undefined,
        meta: nextMeta,
        updatedAt: new Date(),
      })
      .where(eq(schema.conversations.id, existing.id));
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
      meta: jidMeta,
    })
    .returning({ id: schema.conversations.id, mode: schema.conversations.mode });
  return row;
}

async function persistInbound(input: {
  tenantId: string;
  conversationId: string;
  body: string;
  waMessageId: string;
  mediaType?: string;
  meta?: Record<string, unknown>;
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
      mediaType: input.mediaType,
      meta: input.meta ?? {},
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

/**
 * Processa uma mensagem inbound.
 * @param reply Se false, só persiste (sync histórico) — não dispara Donna.
 */
export async function processInboundMessage(
  instanceName: string,
  raw: MessageUpsertData,
  options: { reply?: boolean } = {}
): Promise<"ok" | "skip" | "dup" | "no_tenant"> {
  const shouldReply = options.reply !== false;
  const tenantLink = await resolveTenantByInstance(instanceName);
  if (!tenantLink) {
    console.warn("[webhook] instância sem tenant:", instanceName);
    return "no_tenant";
  }

  if (raw.key?.fromMe) return "skip";

  const jid = raw.key?.remoteJid ?? "";
  if (jid && isGroupJid(jid)) return "skip";

  const phoneE164 = phoneFromMessageKey(raw.key);
  if (!phoneE164) {
    console.warn("[webhook] sem telefone (lid sem alt?):", raw.key?.remoteJid, raw.key?.remoteJidAlt);
    return "skip";
  }

  const enriched = await enrichInboundMessage(instanceName, raw);
  if (!enriched?.body) return "skip";

  const text = enriched.body;

  const waMessageId = raw.key?.id;
  if (!waMessageId) return "skip";

  const tenantId = tenantLink.tenantId;
  const profileId = await ensureDefaultAgentProfile({ tenantId, displayName: "Donna" });
  const clientId = await findClientId(tenantId, phoneE164);
  const conv = await ensureConversation({
    tenantId,
    phoneE164,
    agentProfileId: profileId,
    clientId,
    remoteJid: raw.key?.remoteJid,
    remoteJidAlt: raw.key?.remoteJidAlt,
  });

  const inserted = await persistInbound({
    tenantId,
    conversationId: conv.id,
    body: text,
    waMessageId,
    mediaType: enriched.mediaType,
    meta: enriched.meta,
  });
  if (!inserted) return "dup";

  if (!shouldReply || conv.mode === "human") return "ok";

  // Evita rajada: mesmo texto em <90s ou outra resposta IA ainda "quente"
  const db = createDb();
  const windowStart = new Date(Date.now() - 90_000);
  const [sameBody] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conv.id),
        eq(schema.messages.direction, "inbound"),
        eq(schema.messages.body, text),
        gte(schema.messages.createdAt, windowStart),
        ne(schema.messages.waMessageId, waMessageId)
      )
    )
    .limit(1);
  if (sameBody) {
    console.warn("[webhook] skip reply — texto duplicado recente", phoneE164);
    return "dup";
  }

  const hotStart = new Date(Date.now() - 20_000);
  const [hotOut] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conv.id),
        eq(schema.messages.direction, "outbound_ai"),
        gte(schema.messages.createdAt, hotStart)
      )
    )
    .limit(1);
  if (hotOut) {
    console.warn("[webhook] skip reply — outbound recente (debounce)", phoneE164);
    return "ok";
  }

  // Lock curto na conversa (Evolution retries)
  const [lockRow] = await db
    .select({ meta: schema.conversations.meta })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conv.id))
    .limit(1);
  const lockAtRaw = lockRow?.meta?.replyLockAt;
  const lockAtMs = lockAtRaw ? Date.parse(String(lockAtRaw)) : 0;
  const lockHolder = lockRow?.meta?.replyLock;
  if (
    lockHolder &&
    lockHolder !== waMessageId &&
    Number.isFinite(lockAtMs) &&
    Date.now() - lockAtMs < 60_000
  ) {
    console.warn("[webhook] skip reply — lock ativo", phoneE164);
    return "ok";
  }
  await db
    .update(schema.conversations)
    .set({
      meta: {
        ...(lockRow?.meta ?? {}),
        replyLock: waMessageId,
        replyLockAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.conversations.id, conv.id));

  const result = await runOrchestrator({
    tenantId,
    conversationId: conv.id,
    phoneE164,
    userText: text,
    mode: "ai",
  });

  if (!result.reply?.trim()) return "ok";

  const connection = await syncWhatsAppConnectionByInstance(instanceName);
  if (connection?.status !== "connected") return "ok";

  await deliverWhatsAppText({
    tenantId,
    instanceName,
    phoneE164,
    text: result.reply,
    conversationId: conv.id,
    direction: "outbound_ai",
  });

  return "ok";
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

  // Auth real = AGENT_WEBHOOK_SECRET (query/header).
  // NÃO comparar body.apikey com EVOLUTION_API_KEY: a Evolution envia o
  // token da instância (≠ AUTHENTICATION_API_KEY global) → 401 em todo inbound.
  if (expectedSecret) {
    const url = new URL(request.url);
    const q = url.searchParams.get("secret");
    const h = request.headers.get("x-webhook-secret");
    if (q !== expectedSecret && h !== expectedSecret) {
      throw new Error("Unauthorized webhook");
    }
  }

  void body;
}

export async function handleEvolutionWebhook(body: EvolutionWebhookBody) {
  const instanceName = body.instance?.trim();
  if (!instanceName) return { ok: true, skipped: "no_instance" };

  const event = normalizeEvent(body.event);

  if (event === "messages.upsert") {
    const payload = body.data;
    const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
    let ok = 0;
    for (const item of items) {
      const r = await processInboundMessage(instanceName, item as MessageUpsertData, {
        reply: true,
      });
      if (r === "ok") ok += 1;
    }
    return { ok: true, handled: "messages.upsert", count: items.length, processed: ok };
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

/** Puxa últimas msgs da Evolution e grava na inbox (sem re-responder). */
export async function syncRecentInboundFromEvolution(instanceName: string, limit = 40) {
  const records = await findRecentMessages(instanceName, limit);
  let imported = 0;
  let skipped = 0;
  for (const msg of records) {
    if (msg.key?.fromMe) {
      skipped += 1;
      continue;
    }
    const r = await processInboundMessage(
      instanceName,
      {
        key: msg.key,
        message: msg.message,
        pushName: msg.pushName,
        messageType: msg.messageType,
      },
      { reply: false }
    );
    if (r === "ok") imported += 1;
    else skipped += 1;
  }
  return { imported, skipped, scanned: records.length };
}
