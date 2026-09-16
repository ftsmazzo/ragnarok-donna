import { and, eq, ne } from "drizzle-orm";
import { createDb, schema } from "@/db";
import type { ChatMessage } from "@/server/agent/llm";
import { chatCompletionWithFallback } from "@/server/agent/llm";
import type { MemberRole } from "@/server/types";
import { AppError, isAppError } from "../errors";
import { roleLabel } from "../permissions/roles";
import {
  supportHumanChannelConfigured,
  supportHumanContactHint,
} from "./channel";
import { assertCanUseSupport, getOrCreateSupportThread } from "./queries";
import { buildSupportSystemPrompt } from "./prompt";
import { executeSupportTool, SUPPORT_TOOL_DEFS } from "./tools";
import { searchGuides, getGuidePayload } from "@/content/support/guides";
import { linkifySupportReply } from "@/lib/support-deeplinks";
import { searchHelp } from "./knowledge";
import {
  HUMAN_HANDOFF_ALREADY_REPLY,
  HUMAN_HANDOFF_ACTIVE_REPLY,
  HUMAN_HANDOFF_PENDING_REPLY,
  HUMAN_HANDOFF_QUEUED_REPLY,
  isSuccessfulHttpStatus,
  publicSupportError,
  SUPPORT_WEBHOOK_TIMEOUT_MS,
} from "./reliability";

export type SupportActionResult =
  | { ok: true; threadId: string; reply: string; status: "ai" | "human" }
  | { ok: false; error: string; persisted?: boolean };

async function notifyHandoff(input: {
  tenantId: string;
  tenantName: string;
  userName: string;
  userEmail?: string | null;
  threadId: string;
  reason: string;
  requestId?: string;
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
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.requestId ? { "Idempotency-Key": input.requestId } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(SUPPORT_WEBHOOK_TIMEOUT_MS),
    });
    if (!isSuccessfulHttpStatus(response.status)) {
      console.warn("[support] webhook handoff rejeitado", response.status);
      return false;
    }
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
    return `Não consegui notificar o atendimento humano agora. Continuo te ajudando por aqui. Se for urgente com a Fábrica: ${contact}.`;
  }
  return "Não consegui notificar o atendimento humano agora. Continuo te ajudando por aqui com o que o sistema faz.";
}

async function markHuman(input: {
  tenantId: string;
  threadId: string;
  reason: string;
  tenantName: string;
  userName: string;
  userEmail?: string | null;
  requestId?: string;
}): Promise<{ queued: boolean; alreadyActive: boolean; inProgress: boolean }> {
  const channelOnline = supportHumanChannelConfigured();
  if (!channelOnline) {
    return { queued: false, alreadyActive: false, inProgress: false };
  }

  const db = createDb();
  const now = new Date();
  const [claimed] = await db
    .update(schema.supportThreads)
    .set({ status: "notifying", updatedAt: now })
    .where(
      and(
        eq(schema.supportThreads.id, input.threadId),
        eq(schema.supportThreads.tenantId, input.tenantId),
        ne(schema.supportThreads.status, "human"),
        ne(schema.supportThreads.status, "notifying")
      )
    )
    .returning({ id: schema.supportThreads.id });

  if (!claimed) {
    const [current] = await db
      .select({ status: schema.supportThreads.status })
      .from(schema.supportThreads)
      .where(
        and(
          eq(schema.supportThreads.id, input.threadId),
          eq(schema.supportThreads.tenantId, input.tenantId)
        )
      )
      .limit(1);
    if (current?.status === "human") {
      return { queued: true, alreadyActive: true, inProgress: false };
    }
    if (current?.status === "notifying") {
      return { queued: false, alreadyActive: false, inProgress: true };
    }
    return { queued: false, alreadyActive: false, inProgress: false };
  }

  const notified = await notifyHandoff({
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    userName: input.userName,
    userEmail: input.userEmail,
    threadId: input.threadId,
    reason: input.reason,
    requestId: input.requestId,
  });

  if (!notified) {
    await db
      .update(schema.supportThreads)
      .set({ status: "ai", updatedAt: new Date() })
      .where(
        and(
          eq(schema.supportThreads.id, input.threadId),
          eq(schema.supportThreads.tenantId, input.tenantId),
          eq(schema.supportThreads.status, "notifying")
        )
      );
    return { queued: false, alreadyActive: false, inProgress: false };
  }

  const [activated] = await db
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
        eq(schema.supportThreads.tenantId, input.tenantId),
        eq(schema.supportThreads.status, "notifying")
      )
    )
    .returning({ id: schema.supportThreads.id });

  if (!activated) {
    // A entrega externa ocorreu; outra aba pode ter cancelado o modo humano
    // enquanto o webhook estava em voo.
    return { queued: true, alreadyActive: false, inProgress: false };
  }

  await db.insert(schema.supportMessages).values({
    tenantId: input.tenantId,
    threadId: input.threadId,
    role: "system",
    body: `Pedido de atendimento humano: ${input.reason}. A equipe da Fábrica foi notificada.`,
    meta: { kind: "escalate" },
  });

  return { queued: true, alreadyActive: false, inProgress: false };
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

/** Fallback sem LLM: guia → FAQ + mensagem honesta. */
function offlineReply(userText: string, memberRole?: MemberRole | null): string {
  const guideHits = searchGuides(userText, { memberRole, limit: 1 });
  if (guideHits.length) {
    const hit = guideHits[0];
    const full = getGuidePayload(hit.id, { memberRole });
    if (full?.steps.length) {
      const steps = full.steps
        .slice(0, 4)
        .map((s) => `${s.title}: ${s.detail}`)
        .join(" ");
      const scope =
        full.inRoleScope === false
          ? " (pode exigir dono/admin no menu)."
          : "";
      return linkifySupportReply(
        `${full.summary} ${steps} Menu: ${full.menuPath}. Abra [${full.title}](${full.href})${scope}`
      );
    }
    return linkifySupportReply(
      `${hit.summary} Menu: ${hit.menuPath}. Abra [${hit.title}](${hit.href})`
    );
  }
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
  requestId?: string;
}): Promise<SupportActionResult> {
  let messagePersisted = false;
  try {
    const { session, tenant } = await assertCanUseSupport();
    const text = input.body.trim().slice(0, 4000);
    if (!text) throw new AppError("VALIDATION", "Escreva uma mensagem");
    const requestId = (input.requestId?.trim() || crypto.randomUUID()).slice(0, 80);

    const db = createDb();
    const thread = await getOrCreateSupportThread();
    const now = new Date();

    const [inserted] = await db
      .insert(schema.supportMessages)
      .values({
        tenantId: tenant.id,
        threadId: thread.id,
        role: "user",
        body: text,
        requestId,
        authorUserId: session.user.id,
      })
      .onConflictDoNothing()
      .returning({ id: schema.supportMessages.id });
    messagePersisted = true;

    if (!inserted) {
      const [previousReply] = await db
        .select({ body: schema.supportMessages.body })
        .from(schema.supportMessages)
        .where(
          and(
            eq(schema.supportMessages.tenantId, tenant.id),
            eq(schema.supportMessages.threadId, thread.id),
            eq(schema.supportMessages.requestId, requestId),
            eq(schema.supportMessages.role, "assistant")
          )
        )
        .limit(1);
      if (previousReply) {
        return {
          ok: true,
          threadId: thread.id,
          reply: previousReply.body,
          status: thread.status === "human" ? "human" : "ai",
        };
      }
      return {
        ok: false,
        error: "Esta mensagem já está sendo processada",
        persisted: true,
      };
    }

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
    const humanActive =
      thread.status === "human" &&
      !released &&
      supportHumanChannelConfigured();

    if (humanActive) {
      const forwarded = await notifyHandoff({
        tenantId: tenant.id,
        tenantName: tenant.name,
        userName: session.user.name,
        userEmail: session.user.email,
        threadId: thread.id,
        reason: `Detalhe adicional: ${text.slice(0, 180)}`,
        requestId,
      });
      const reply = forwarded
        ? HUMAN_HANDOFF_ACTIVE_REPLY
        : "Não consegui encaminhar este detalhe ao canal humano agora. Ele ficou salvo aqui; tente novamente ou volte para a IA.";
      await db.insert(schema.supportMessages).values({
        tenantId: tenant.id,
        threadId: thread.id,
        role: "assistant",
        body: reply,
        requestId,
        meta: { kind: "human_queue_ack", forwarded },
      }).onConflictDoNothing();
      return { ok: true, threadId: thread.id, reply, status: "human" };
    }

    const wantsHuman = /\b(humano|atendente|pessoa|falar com (algu[eé]m|voc[eê]s)|suporte humano)\b/i.test(
      text
    );
    if (wantsHuman) {
      const { queued, alreadyActive, inProgress } = await markHuman({
        tenantId: tenant.id,
        threadId: thread.id,
        reason: text.slice(0, 200),
        tenantName: tenant.name,
        userName: session.user.name,
        userEmail: session.user.email,
        requestId,
      });
      const reply = inProgress
        ? HUMAN_HANDOFF_PENDING_REPLY
        : queued
          ? alreadyActive
            ? HUMAN_HANDOFF_ALREADY_REPLY
            : HUMAN_HANDOFF_QUEUED_REPLY
          : offlineHumanReply();
      await db.insert(schema.supportMessages).values({
        tenantId: tenant.id,
        threadId: thread.id,
        role: "assistant",
        body: reply,
        requestId,
        meta: {
          kind: inProgress
            ? "escalate_pending"
            : queued
              ? "escalate_ack"
              : "escalate_offline",
        },
      }).onConflictDoNothing();
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
    ];
    if (inserted) {
      history.push({ role: "user", content: text });
    }

    let escalateReason: string | null = null;
    let finalText: string | null = null;

    for (let step = 0; step < 4; step++) {
      const result = await chatCompletionWithFallback({
        messages: history,
        tools: SUPPORT_TOOL_DEFS,
        temperature: 0.55,
        maxTokens: 900,
      });

      if (!result) {
        finalText = offlineReply(text, session.role);
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
          const toolOut = executeSupportTool(call.function.name, args, {
            memberRole: session.role,
          });
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

      finalText = result.content?.trim() || offlineReply(text, session.role);
      break;
    }

    let queued = false;
    let handoffInProgress = false;
    if (escalateReason) {
      const marked = await markHuman({
        tenantId: tenant.id,
        threadId: thread.id,
        reason: escalateReason,
        tenantName: tenant.name,
        userName: session.user.name,
        userEmail: session.user.email,
        requestId,
      });
      queued = marked.queued;
      handoffInProgress = marked.inProgress;
      if (!queued && !handoffInProgress && !finalText) {
        // IA pediu humano sem canal e não deixou texto — responde com FAQ se houver
        finalText = offlineReply(text, session.role);
        if (finalText.startsWith("Não consegui")) {
          finalText = offlineHumanReply();
        }
      }
    }

    const reply = linkifySupportReply(
      finalText ||
        (handoffInProgress
          ? HUMAN_HANDOFF_PENDING_REPLY
          : queued
          ? HUMAN_HANDOFF_QUEUED_REPLY
          : escalateReason
            ? offlineHumanReply()
            : offlineReply(text, session.role))
    );

    await db.insert(schema.supportMessages).values({
      tenantId: tenant.id,
      threadId: thread.id,
      role: "assistant",
      body: reply,
      requestId,
      meta: escalateReason ? { escalated: queued, escalateAttempt: true } : {},
    }).onConflictDoNothing();

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
    if (isAppError(err)) {
      return { ok: false, error: err.message, persisted: messagePersisted };
    }
    return {
      ok: false,
      error: publicSupportError(err),
      persisted: messagePersisted,
    };
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
    let alreadyActive = false;
    let inProgress = false;
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
      alreadyActive = marked.alreadyActive;
      inProgress = marked.inProgress;
    } else {
      queued = supportHumanChannelConfigured();
      alreadyActive = queued;
    }

    const reply = inProgress
      ? HUMAN_HANDOFF_PENDING_REPLY
      : queued
        ? alreadyActive
          ? HUMAN_HANDOFF_ALREADY_REPLY
          : HUMAN_HANDOFF_QUEUED_REPLY
        : offlineHumanReply();
    const db = createDb();
    await db.insert(schema.supportMessages).values({
      tenantId: tenant.id,
      threadId: thread.id,
      role: "assistant",
      body: reply,
      meta: {
        kind: inProgress
          ? "escalate_pending"
          : queued
            ? "escalate_button"
            : "escalate_offline",
      },
    });

    return {
      ok: true,
      threadId: thread.id,
      reply,
      status: queued ? "human" : "ai",
    };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    return {
      ok: false,
      error: publicSupportError(err, "Não foi possível chamar o atendimento humano"),
    };
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
    return {
      ok: false,
      error: publicSupportError(err, "Não foi possível voltar para a IA"),
    };
  }
}
