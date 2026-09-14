import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import type { ChatMessage } from "@/server/agent/llm";
import { chatCompletionWithFallback } from "@/server/agent/llm";
import { AppError, isAppError } from "../errors";
import { roleLabel } from "../permissions/roles";
import {
  supportHumanChannelConfigured,
  supportHumanContactHint,
} from "./channel";
import { assertCanUseSupport, getOrCreateSupportThread } from "./queries";
import { buildSupportSystemPrompt } from "./prompt";
import { executeSupportTool, SUPPORT_TOOL_DEFS } from "./tools";
import { searchHelp } from "./knowledge";

export type SupportActionResult =
  | { ok: true; threadId: string; reply: string; status: "ai" | "human" }
  | { ok: false; error: string };

async function notifyHandoff(input: {
  tenantId: string;
  tenantName: string;
  userName: string;
  userEmail?: string | null;
  threadId: string;
  reason: string;
}) {
  const payload = {
    type: "support_handoff",
    at: new Date().toISOString(),
    ...input,
  };
  console.info("[support] handoff", payload);

  const webhook = process.env.SUPPORT_HANDOFF_WEBHOOK_URL?.trim();
  if (!webhook) return false;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return true;
  } catch (err) {
    console.warn(
      "[support] webhook handoff falhou",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

function offlineHumanReply(): string {
  const contact = supportHumanContactHint();
  if (contact) {
    return `Agora não tem atendente humano neste chat. Continuo te ajudando por aqui. Se for urgente com a Fábrica: ${contact}.`;
  }
  return "Agora não tem atendente humano neste chat — não tem pra onde notificar. Continuo te ajudando por aqui com o que o sistema faz.";
}

async function markHuman(input: {
  tenantId: string;
  threadId: string;
  reason: string;
  tenantName: string;
  userName: string;
  userEmail?: string | null;
}): Promise<{ queued: boolean }> {
  const channelOnline = supportHumanChannelConfigured();
  if (!channelOnline) {
    return { queued: false };
  }

  const notified = await notifyHandoff({
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    userName: input.userName,
    userEmail: input.userEmail,
    threadId: input.threadId,
    reason: input.reason,
  });

  if (!notified) {
    return { queued: false };
  }

  const db = createDb();
  const now = new Date();
  await db
    .update(schema.supportThreads)
    .set({
      status: "human",
      humanRequestedAt: now,
      updatedAt: now,
      meta: { lastEscalateReason: input.reason },
    })
    .where(
      and(
        eq(schema.supportThreads.id, input.threadId),
        eq(schema.supportThreads.tenantId, input.tenantId)
      )
    );

  await db.insert(schema.supportMessages).values({
    tenantId: input.tenantId,
    threadId: input.threadId,
    role: "system",
    body: `Pedido de atendimento humano: ${input.reason}. A equipe da Fábrica foi notificada.`,
    meta: { kind: "escalate" },
  });

  return { queued: true };
}

/** Threads antigas presas em "human" sem canal: volta pra IA. */
async function releaseStaleHumanQueue(input: {
  tenantId: string;
  threadId: string;
  status: string;
}) {
  if (input.status !== "human") return false;
  if (supportHumanChannelConfigured()) return false;

  const db = createDb();
  const now = new Date();
  await db
    .update(schema.supportThreads)
    .set({
      status: "ai",
      updatedAt: now,
      meta: { autoReleasedFromHuman: now.toISOString(), reason: "no_human_channel" },
    })
    .where(
      and(
        eq(schema.supportThreads.id, input.threadId),
        eq(schema.supportThreads.tenantId, input.tenantId)
      )
    );
  return true;
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Fallback sem LLM: FAQ + mensagem honesta. */
function offlineReply(userText: string): string {
  const hits = searchHelp(userText, 2);
  if (hits.length) {
    const top = hits[0];
    const path = top.menuPath ? ` Fica em ${top.menuPath}.` : "";
    return `${top.answer}${path}`;
  }
  return "Não consegui consultar a IA agora. Tenta de novo em instantes.";
}

export async function sendSupportMessage(input: {
  body: string;
}): Promise<SupportActionResult> {
  try {
    const { session, tenant } = await assertCanUseSupport();
    const text = input.body.trim().slice(0, 4000);
    if (!text) throw new AppError("VALIDATION", "Escreva uma mensagem");

    const db = createDb();
    const thread = await getOrCreateSupportThread();
    const now = new Date();

    await db.insert(schema.supportMessages).values({
      tenantId: tenant.id,
      threadId: thread.id,
      role: "user",
      body: text,
      authorUserId: session.user.id,
    });

    await db
      .update(schema.supportThreads)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.supportThreads.id, thread.id),
          eq(schema.supportThreads.tenantId, tenant.id)
        )
      );

    const released = await releaseStaleHumanQueue({
      tenantId: tenant.id,
      threadId: thread.id,
      status: thread.status,
    });
    const humanActive = thread.status === "human" && !released && supportHumanChannelConfigured();

    if (humanActive) {
      const reply =
        "Sua conversa já está na fila humana. Pode continuar escrevendo — a equipe responde por aqui quando puder.";
      await db.insert(schema.supportMessages).values({
        tenantId: tenant.id,
        threadId: thread.id,
        role: "assistant",
        body: reply,
        meta: { kind: "human_queue_ack" },
      });
      return { ok: true, threadId: thread.id, reply, status: "human" };
    }

    const wantsHuman = /\b(humano|atendente|pessoa|falar com (algu[eé]m|voc[eê]s)|suporte humano)\b/i.test(
      text
    );
    if (wantsHuman) {
      const { queued } = await markHuman({
        tenantId: tenant.id,
        threadId: thread.id,
        reason: text.slice(0, 200),
        tenantName: tenant.name,
        userName: session.user.name,
        userEmail: session.user.email,
      });
      const reply = queued
        ? "Beleza — passei pra fila humana. Quando a Fábrica estiver online, alguém entra nessa conversa."
        : offlineHumanReply();
      await db.insert(schema.supportMessages).values({
        tenantId: tenant.id,
        threadId: thread.id,
        role: "assistant",
        body: reply,
        meta: { kind: queued ? "escalate_ack" : "escalate_offline" },
      });
      return {
        ok: true,
        threadId: thread.id,
        reply,
        status: queued ? "human" : "ai",
      };
    }

    const history: ChatMessage[] = [
      {
        role: "system",
        content: buildSupportSystemPrompt({
          userName: session.user.name,
          roleLabel: roleLabel(session.role),
          tenantName: tenant.name,
          humanChannelOnline: supportHumanChannelConfigured(),
        }),
      },
      ...thread.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-16)
        .map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
          content: m.body,
        })),
      { role: "user", content: text },
    ];

    let escalateReason: string | null = null;
    let finalText: string | null = null;

    for (let step = 0; step < 4; step++) {
      const result = await chatCompletionWithFallback({
        messages: history,
        tools: SUPPORT_TOOL_DEFS,
        temperature: 0.55,
        maxTokens: 500,
      });

      if (!result) {
        finalText = offlineReply(text);
        break;
      }

      if (result.toolCalls.length) {
        history.push({
          role: "assistant",
          content: result.content,
          tool_calls: result.toolCalls,
        });

        for (const call of result.toolCalls) {
          const args = parseToolArgs(call.function.arguments);
          const toolOut = executeSupportTool(call.function.name, args);
          if (toolOut.escalate) {
            escalateReason = toolOut.escalateReason || "Handoff via tool";
          }
          history.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(toolOut.data),
          });
        }
        continue;
      }

      finalText = result.content?.trim() || offlineReply(text);
      break;
    }

    let queued = false;
    if (escalateReason) {
      const marked = await markHuman({
        tenantId: tenant.id,
        threadId: thread.id,
        reason: escalateReason,
        tenantName: tenant.name,
        userName: session.user.name,
        userEmail: session.user.email,
      });
      queued = marked.queued;
      if (!queued && !finalText) {
        // IA pediu humano sem canal e não deixou texto — responde com FAQ se houver
        finalText = offlineReply(text);
        if (finalText.startsWith("Não consegui")) {
          finalText = offlineHumanReply();
        }
      }
    }

    const reply =
      finalText ||
      (queued
        ? "Passei pra fila humana. Quando alguém da Fábrica estiver online, responde por aqui."
        : escalateReason
          ? offlineHumanReply()
          : offlineReply(text));

    await db.insert(schema.supportMessages).values({
      tenantId: tenant.id,
      threadId: thread.id,
      role: "assistant",
      body: reply,
      meta: escalateReason ? { escalated: queued, escalateAttempt: true } : {},
    });

    await db
      .update(schema.supportThreads)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.supportThreads.id, thread.id),
          eq(schema.supportThreads.tenantId, tenant.id)
        )
      );

    return {
      ok: true,
      threadId: thread.id,
      reply,
      status: queued ? "human" : "ai",
    };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    const msg = err instanceof Error ? err.message : "Erro no suporte";
    return { ok: false, error: msg };
  }
}

export async function escalateSupportHuman(input?: {
  reason?: string;
}): Promise<SupportActionResult> {
  try {
    const { session, tenant } = await assertCanUseSupport();
    const thread = await getOrCreateSupportThread();
    const reason = (input?.reason || "Pedido pelo botão Falar com humano").slice(0, 240);

    let queued = false;
    if (thread.status !== "human") {
      const marked = await markHuman({
        tenantId: tenant.id,
        threadId: thread.id,
        reason,
        tenantName: tenant.name,
        userName: session.user.name,
        userEmail: session.user.email,
      });
      queued = marked.queued;
    } else {
      queued = supportHumanChannelConfigured();
    }

    const reply = queued
      ? "Ok — fila humana. Pode deixar o detalhe do problema aqui; alguém da Fábrica responde quando estiver online."
      : offlineHumanReply();
    const db = createDb();
    await db.insert(schema.supportMessages).values({
      tenantId: tenant.id,
      threadId: thread.id,
      role: "assistant",
      body: reply,
      meta: { kind: queued ? "escalate_button" : "escalate_offline" },
    });

    return {
      ok: true,
      threadId: thread.id,
      reply,
      status: queued ? "human" : "ai",
    };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    const msg = err instanceof Error ? err.message : "Erro no handoff";
    return { ok: false, error: msg };
  }
}

export async function returnSupportToAi(): Promise<SupportActionResult> {
  try {
    const { session, tenant } = await assertCanUseSupport();
    const thread = await getOrCreateSupportThread();
    const db = createDb();
    const now = new Date();

    await db
      .update(schema.supportThreads)
      .set({
        status: "ai",
        updatedAt: now,
        meta: { returnedToAiAt: now.toISOString(), byUserId: session.user.id },
      })
      .where(
        and(
          eq(schema.supportThreads.id, thread.id),
          eq(schema.supportThreads.tenantId, tenant.id)
        )
      );

    const reply = "Voltei pro modo automático. Pode perguntar de novo sobre o app.";
    await db.insert(schema.supportMessages).values({
      tenantId: tenant.id,
      threadId: thread.id,
      role: "system",
      body: reply,
      meta: { kind: "return_ai" },
    });

    return { ok: true, threadId: thread.id, reply, status: "ai" };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    const msg = err instanceof Error ? err.message : "Erro";
    return { ok: false, error: msg };
  }
}
