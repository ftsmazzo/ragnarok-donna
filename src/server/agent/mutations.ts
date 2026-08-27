import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, NotFoundError } from "../errors";
import { requireCapability } from "../permissions/guards";
import { requireSession, requireTenantContext } from "../context/tenant";
import { ensureDefaultAgentProfile } from "./persona-profile";
import { deliverWhatsAppText, getConnectionForTenant } from "./outbound";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function assertCanWrite() {
  const session = await requireSession();
  requireCapability(session, "conversations.write");
  return session;
}

async function loadOwnedConversation(conversationId: string, tenantId: string) {
  const db = createDb();
  const [row] = await db
    .select({
      id: schema.conversations.id,
      mode: schema.conversations.mode,
      phoneE164: schema.conversations.phoneE164,
      agentProfileId: schema.conversations.agentProfileId,
    })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!row) throw new NotFoundError("Conversa não encontrada");
  return row;
}

async function insertSystemMessage(input: {
  tenantId: string;
  conversationId: string;
  body: string;
}) {
  const db = createDb();
  const now = new Date();
  await db.insert(schema.messages).values({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    direction: "system",
    body: input.body,
  });
  await db
    .update(schema.conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(schema.conversations.id, input.conversationId));
}

/** Recepção assume o thread — IA para de responder. */
export async function takeHandoff(conversationId: string): Promise<ActionResult> {
  try {
    const session = await assertCanWrite();
    const tenant = await requireTenantContext();
    await loadOwnedConversation(conversationId, tenant.id);
    const db = createDb();
    const now = new Date();

    await db
      .update(schema.conversations)
      .set({
        mode: "human",
        assignedUserId: session.user.id,
        humanTakenAt: now,
        humanRequestedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.tenantId, tenant.id)
        )
      );

    await insertSystemMessage({
      tenantId: tenant.id,
      conversationId,
      body: `${session.user.name} assumiu o atendimento (modo humano).`,
    });

    return { ok: true, id: conversationId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao assumir conversa",
    };
  }
}

/** Devolve o thread para a IA. */
export async function returnToAi(conversationId: string): Promise<ActionResult> {
  try {
    const session = await assertCanWrite();
    const tenant = await requireTenantContext();
    await loadOwnedConversation(conversationId, tenant.id);
    const db = createDb();
    const now = new Date();

    await db
      .update(schema.conversations)
      .set({
        mode: "ai",
        assignedUserId: null,
        humanReturnedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.tenantId, tenant.id)
        )
      );

    await insertSystemMessage({
      tenantId: tenant.id,
      conversationId,
      body: `${session.user.name} devolveu o atendimento para a IA.`,
    });

    return { ok: true, id: conversationId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao devolver para IA",
    };
  }
}

/**
 * Mensagem da recepção — persiste e envia via Evolution quando conectado.
 */
export async function sendHumanMessage(
  conversationId: string,
  body: string
): Promise<ActionResult> {
  try {
    const session = await assertCanWrite();
    const tenant = await requireTenantContext();
    const conv = await loadOwnedConversation(conversationId, tenant.id);
    const text = body.trim().slice(0, 4000);
    if (!text) throw new AppError("VALIDATION", "Mensagem vazia");
    if (conv.mode !== "human") {
      throw new AppError("VALIDATION", "Assuma o atendimento (modo humano) para responder");
    }

    const connection = await getConnectionForTenant(tenant.id);
    if (connection?.status === "connected") {
      const sent = await deliverWhatsAppText({
        tenantId: tenant.id,
        instanceName: connection.instanceName,
        phoneE164: conv.phoneE164,
        text,
        conversationId,
        direction: "outbound_human",
        operatorUserId: session.user.id,
      });
      if (!sent.ok) throw new AppError("UPSTREAM", sent.error);
      await createDb()
        .update(schema.conversations)
        .set({ assignedUserId: session.user.id, updatedAt: new Date() })
        .where(eq(schema.conversations.id, conversationId));
      return { ok: true, id: sent.messageId };
    }

    const db = createDb();
    const now = new Date();
    const [msg] = await db
      .insert(schema.messages)
      .values({
        tenantId: tenant.id,
        conversationId,
        direction: "outbound_human",
        body: text,
        operatorUserId: session.user.id,
      })
      .returning({ id: schema.messages.id });

    await db
      .update(schema.conversations)
      .set({
        lastMessageAt: now,
        assignedUserId: session.user.id,
        updatedAt: now,
      })
      .where(eq(schema.conversations.id, conversationId));

    return { ok: true, id: msg.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao enviar mensagem",
    };
  }
}

/** Apaga todas as conversas/mensagens/tool calls do tenant (inbox limpa p/ teste). */
export async function clearAgentInbox(): Promise<
  { ok: true; conversations: number; messages: number } | { ok: false; error: string }
> {
  try {
    await assertCanWrite();
    const tenant = await requireTenantContext();
    const db = createDb();

    const msgs = await db
      .delete(schema.messages)
      .where(eq(schema.messages.tenantId, tenant.id))
      .returning({ id: schema.messages.id });

    const tools = await db
      .delete(schema.agentToolCalls)
      .where(eq(schema.agentToolCalls.tenantId, tenant.id))
      .returning({ id: schema.agentToolCalls.id });

    const convs = await db
      .delete(schema.conversations)
      .where(eq(schema.conversations.tenantId, tenant.id))
      .returning({ id: schema.conversations.id });

    void tools;
    return { ok: true, conversations: convs.length, messages: msgs.length };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao limpar inbox",
    };
  }
}

/** Conversa fake para validar inbox/handoff sem WhatsApp (dev/demo). */
export async function seedDemoConversation(): Promise<ActionResult> {
  try {
    await assertCanWrite();
    const tenant = await requireTenantContext();
    const profileId = await ensureDefaultAgentProfile({
      tenantId: tenant.id,
      displayName: "Donna",
    });
    const db = createDb();
    const phone = "+5500000000000";

    const [existing] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.tenantId, tenant.id),
          eq(schema.conversations.phoneE164, phone)
        )
      )
      .limit(1);

    if (existing) return { ok: true, id: existing.id };

    const now = new Date();
    const [conv] = await db
      .insert(schema.conversations)
      .values({
        tenantId: tenant.id,
        phoneE164: phone,
        mode: "ai",
        agentProfileId: profileId,
        lastMessageAt: now,
        meta: { demo: true },
      })
      .returning({ id: schema.conversations.id });

    await db.insert(schema.messages).values([
      {
        tenantId: tenant.id,
        conversationId: conv.id,
        direction: "inbound",
        body: "Oi, quero marcar um horário amanhã.",
        createdAt: new Date(now.getTime() - 120_000),
      },
      {
        tenantId: tenant.id,
        conversationId: conv.id,
        direction: "outbound_ai",
        body: "Olá! Sou Donna. Posso ajudar a agendar — ou chamar a recepção se preferir.",
        createdAt: new Date(now.getTime() - 60_000),
      },
      {
        tenantId: tenant.id,
        conversationId: conv.id,
        direction: "inbound",
        body: "Prefiro falar com um atendente.",
        createdAt: now,
      },
    ]);

    return { ok: true, id: conv.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao criar conversa de teste",
    };
  }
}
