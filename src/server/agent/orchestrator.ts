/**
 * Camadas Donna (docs/DONNA.md):
 * Orquestrador → Persona → Skills (playbooks) → Tools → Domínio
 *
 * Um agente conversacional (Donna). O "orquestrador" é o runtime que
 * carrega persona + skills e executa tools — não é um segundo chatbot.
 */
import { and, desc, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  compileBusinessFactsForPrompt,
  readBusinessProfileFromSettings,
} from "./business-profile";
import { ensureBusinessProfileIfMissing } from "./ensure-business-profile";
import {
  chatCompletionWithFallback,
  getFallbackModel,
  getLlmConfig,
  getPrimaryModel,
  type ChatMessage,
} from "./llm";
import {
  compilePersonaToSystemPrompt,
  normalizeReplyLength,
  type AgentPersona,
} from "./persona";
import {
  buildToolsForSkills,
  compileSkillsBlock,
  listEnabledSkills,
  skillsUsedFromTools,
} from "./skills";
import { executeTool } from "./tools";
import { buildCalendarContext, resolveTemporalPhrase } from "./temporal";
import {
  applySchedulingIntentToToolArgs,
  extractSchedulingIntent,
} from "./scheduling-intent";
import { extractWaitlistContextFromThread } from "./waitlist-context";
import {
  donnaOfferedAlternatives,
  isShortThanks,
  isSoftRefusalOfAlternatives,
  isStrictWaitlistAccept,
  isWaitlistStatusQuestion,
  lastDonnaMessage,
  runtimeRules,
  userPickedAlternative,
  waitlistAlreadyOffered,
  waitlistConfirmReply,
  waitlistFailReply,
  waitlistOfferReply,
} from "./brain-policy";
import type { AgentSkillName, AgentToolName, OrchestratorInput, OrchestratorResult } from "./types";

function readPersona(raw: unknown): AgentPersona | null {
  if (!raw || typeof raw !== "object" || Object.keys(raw as object).length === 0) return null;
  return raw as AgentPersona;
}

async function loadRecentThread(conversationId: string, limit = 12) {
  const db = createDb();
  const rows = await db
    .select({
      direction: schema.messages.direction,
      body: schema.messages.body,
    })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);

  return rows.reverse().map((r) => {
    const role =
      r.direction === "inbound"
        ? "cliente"
        : r.direction === "outbound_ai"
          ? "donna"
          : r.direction === "outbound_human"
            ? "recepção"
            : "sistema";
    return `${role}: ${r.body}`;
  });
}

export async function getDefaultAgentProfile(tenantId: string) {
  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, tenantId),
        eq(schema.agentProfiles.isActive, true),
        eq(schema.agentProfiles.isDefault, true)
      )
    )
    .limit(1);
  return row ?? null;
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

async function recentBookingMeta(conversationId: string): Promise<boolean> {
  const db = createDb();
  const [row] = await db
    .select({ meta: schema.conversations.meta })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  const raw = (row?.meta as Record<string, unknown> | null)?.bookingConfirmedAt;
  if (typeof raw !== "string") return false;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < 10 * 60_000;
}

async function markBookingConfirmed(conversationId: string) {
  const db = createDb();
  const [row] = await db
    .select({ meta: schema.conversations.meta })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  if (!row) return;
  await db
    .update(schema.conversations)
    .set({
      meta: {
        ...((row.meta as Record<string, unknown> | null) ?? {}),
        bookingConfirmedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.conversations.id, conversationId));
}

/**
 * Runtime LLM-first: persona + skills → tools → resposta conversacional.
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  if (input.mode === "human") {
    return { reply: null, skills: [], toolCalls: [] };
  }

  if (!getLlmConfig()) {
    return {
      reply:
        "Estou com a inteligência fora do ar neste momento. Pode tentar de novo em instantes ou pedir a recepção?",
      skills: [],
      toolCalls: [],
    };
  }

  const profile = await getDefaultAgentProfile(input.tenantId);
  const displayName = profile?.displayName || profile?.name || "Donna";
  const persona = readPersona(profile?.persona);
  const toolsEnabled = (profile?.toolsEnabled as string[] | null) ?? null;

  const enabledSkills = listEnabledSkills(toolsEnabled);
  const skillNames = enabledSkills.map((s) => s.name) as AgentSkillName[];
  const tools = buildToolsForSkills({ skills: skillNames, toolsEnabled });

  await ensureBusinessProfileIfMissing(input.tenantId);

  const db = createDb();
  const [tenant] = await db
    .select({ name: schema.tenants.name, settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, input.tenantId))
    .limit(1);

  const businessName = tenant?.name || "a barbearia";
  const businessProfile = readBusinessProfileFromSettings(tenant?.settings);
  const businessFacts = businessProfile
    ? compileBusinessFactsForPrompt(businessProfile)
    : "";

  const systemPrompt = [
    profile?.systemPrompt?.trim() ||
      (persona ? compilePersonaToSystemPrompt(persona, displayName) : `Você é ${displayName}.`),
    businessFacts,
    compileSkillsBlock(skillNames),
    buildCalendarContext(),
    runtimeRules(
      businessName,
      displayName,
      input.phoneE164,
      normalizeReplyLength(persona?.persona?.comprimento_resposta)
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  const history = await loadRecentThread(input.conversationId);
  const historyBlock = history.length
    ? `Histórico recente:\n${history.join("\n")}`
    : "Histórico: (início da conversa)";

  const inboundOnly = history
    .filter((l) => l.startsWith("cliente:"))
    .map((l) => l.replace(/^cliente:\s*/i, ""))
    .join("\n");
  const schedulingIntent = extractSchedulingIntent(input.userText, {
    inboundHistory: inboundOnly,
  });

  // Pós-agendamento: "obrigada" / "ok" → não reconfirmar
  if (isShortThanks(input.userText)) {
    const recentBook = await recentBookingMeta(input.conversationId);
    if (recentBook) {
      return {
        reply: "Por nada — te esperamos! Qualquer coisa é só chamar.",
        skills: ["skill.schedule"],
        toolCalls: [],
      };
    }
  }

  // Recusou alternativas → oferta de espera imediata (sem LLM = sem silêncio/timeout)
  if (isSoftRefusalOfAlternatives(input.userText, history)) {
    return {
      reply: waitlistOfferReply(),
      skills: ["skill.schedule"],
      toolCalls: [],
    };
  }

  // Aceitou espera após oferta → grava direto (aceite CURTO; "pode confirmar" NÃO entra aqui)
  if (isStrictWaitlistAccept(input.userText, history)) {
    const ctx = extractWaitlistContextFromThread(history, input.userText);
    const added = await executeTool(
      "add_to_waitlist",
      {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        agentProfileId: profile?.id,
      },
      {
        phone: input.phoneE164,
        staffId: ctx.staffName ?? undefined,
        serviceId: ctx.serviceQuery ?? undefined,
        desiredDate: ctx.desiredDate ?? undefined,
        notes: ctx.notes,
      }
    );
    const detail = [
      ctx.staffName ? `com ${ctx.staffName}` : null,
      ctx.preferredHour != null
        ? `às ${String(ctx.preferredHour).padStart(2, "0")}h`
        : null,
      ctx.desiredDate ? `(${ctx.desiredDate})` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      reply: added.ok
        ? waitlistConfirmReply(detail)
        : waitlistFailReply(),
      skills: ["skill.schedule"],
      toolCalls: [{ name: "add_to_waitlist", ok: added.ok }],
    };
  }

  // "Estou na lista?" / "pode confirmar?" → consulta, não reinsere
  if (isWaitlistStatusQuestion(input.userText)) {
    const listed = await executeTool(
      "list_waitlist",
      {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        agentProfileId: profile?.id,
      },
      { status: "waiting", limit: 40 }
    );
    const entries =
      listed.ok && listed.data && typeof listed.data === "object"
        ? ((listed.data as { entries?: { phone?: string | null; notes?: string | null; desiredDate?: string | null; staffName?: string | null }[] })
            .entries ?? [])
        : [];
    const phoneDigits = input.phoneE164.replace(/\D/g, "").slice(-11);
    const mine = entries.filter((e) => (e.phone || "").replace(/\D/g, "").slice(-11) === phoneDigits);
    if (mine.length) {
      const e = mine[0]!;
      const bits = [
        e.staffName ? `com ${e.staffName}` : null,
        e.desiredDate ? `em ${e.desiredDate}` : null,
        e.notes || null,
      ]
        .filter(Boolean)
        .join(" — ");
      return {
        reply: `Sim, você está na lista de espera${bits ? ` (${bits})` : ""}. Se liberar, te aviso aqui no Zap.`,
        skills: ["skill.schedule"],
        toolCalls: [{ name: "list_waitlist", ok: true }],
      };
    }
    return {
      reply:
        "Não achei você na lista de espera agora. Se quiser, te coloco de novo — me diz o dia, horário e profissional.",
      skills: ["skill.schedule"],
      toolCalls: [{ name: "list_waitlist", ok: listed.ok }],
    };
  }

  const toolCallsAudit: OrchestratorResult["toolCalls"] = [];
  const toolsFired: AgentToolName[] = [];
  let handoff = false;
  /** Alternativas calculadas — se a LLM esquecer, anexa na resposta. */
  let pendingAlternatives: string[] = [];
  let waitlistAcceptedThisTurn = false;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${historyBlock}\n\nMensagem atual do cliente:\n"""${input.userText}"""`,
    },
  ];

  const model = getPrimaryModel() || profile?.model || undefined;
  const fallbackModel = getFallbackModel();
  const temperature =
    typeof profile?.temperature === "number" ? Math.min(1, Math.max(0, profile.temperature / 100)) : 0.45;

  const toolCtx = {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    agentProfileId: profile?.id,
  };

  for (let step = 0; step < 6; step += 1) {
    const result = await chatCompletionWithFallback({
      model,
      fallbackModel,
      messages,
      tools,
      temperature,
      maxTokens: 700,
      timeoutMs: 50_000,
    });

    if (!result) {
      return {
        reply:
          "Tive uma instabilidade agora. Pode repetir o pedido? Se preferir, chamo a recepção.",
        skills: skillsUsedFromTools(toolsFired),
        toolCalls: toolCallsAudit,
      };
    }

    if (result.toolCalls.length) {
      messages.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const name = call.function.name as AgentToolName;
        const args = parseToolArgs(call.function.arguments);
        if (name === "find_client" && !args.phoneE164) args.phoneE164 = input.phoneE164;
        if (name === "list_client_appointments" && !args.range) args.range = "upcoming";
        if (name === "list_client_appointments" && !args.phoneE164 && !args.clientId) {
          args.phoneE164 = input.phoneE164;
        }
        if (name === "list_slots" || name === "resolve_date" || name === "book_appointment") {
          Object.assign(args, applySchedulingIntentToToolArgs(name, args, schedulingIntent));
        }
        if (name === "list_slots") {
          const missingDate =
            !args.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(args.date));
          if (missingDate && !args.datePhrase && schedulingIntent.date) {
            args.date = schedulingIntent.date;
            args.datePhrase = schedulingIntent.datePhrase || input.userText;
          } else if (missingDate && !args.datePhrase) {
            const guessed =
              resolveTemporalPhrase(input.userText) ||
              resolveTemporalPhrase(`${inboundOnly}\n${input.userText}`);
            if (guessed) {
              args.date = guessed.date;
              args.datePhrase = input.userText;
            }
          }
          if (args.preferredHour == null || args.preferredHour === "") {
            if (schedulingIntent.preferredHour != null) {
              args.preferredHour = schedulingIntent.preferredHour;
            }
          }
          if (!args.staffId && !args.staffName && schedulingIntent.staffName) {
            args.staffName = schedulingIntent.staffName;
          }
        }
        if (name === "resolve_date" && !args.phrase) {
          args.phrase = schedulingIntent.datePhrase || input.userText;
        }
        if (name === "add_to_waitlist") {
          const ctx = extractWaitlistContextFromThread(history, input.userText);
          if (!args.phone && !args.phoneE164) args.phone = input.phoneE164;
          if (!args.staffId && ctx.staffName) args.staffId = ctx.staffName;
          if (!args.serviceId && ctx.serviceQuery) args.serviceId = ctx.serviceQuery;
          if (!args.desiredDate && ctx.desiredDate) args.desiredDate = ctx.desiredDate;
          if (!args.notes || String(args.notes).length < 12) args.notes = ctx.notes;
          waitlistAcceptedThisTurn = true;
        }
        if (name === "send_whatsapp" && !args.phoneE164) args.phoneE164 = input.phoneE164;

        // Lista de espera é 100% Donna — não escalar para humano nesse fluxo
        if (
          name === "handoff_human" &&
          (waitlistAcceptedThisTurn ||
            /espera|lista de espera|me avisa se liberar|quero sim/i.test(input.userText))
        ) {
          const forcedCtx = extractWaitlistContextFromThread(history, input.userText);
          const forced = await executeTool("add_to_waitlist", toolCtx, {
            phone: input.phoneE164,
            staffId: args.staffId || forcedCtx.staffName || undefined,
            serviceId: args.serviceId || forcedCtx.serviceQuery || undefined,
            desiredDate: args.desiredDate || forcedCtx.desiredDate || undefined,
            notes: String(args.reason ?? args.notes ?? forcedCtx.notes),
          });
          toolCallsAudit.push({ name: "add_to_waitlist", ok: forced.ok });
          toolsFired.push("add_to_waitlist");
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name,
            content: JSON.stringify(
              forced.ok
                ? {
                    ok: true,
                    redirected: "add_to_waitlist",
                    waitlistId: (forced.data as { waitlistId?: string } | undefined)?.waitlistId,
                    instruction:
                      "Cliente colocado na espera. Confirme no Zap. NÃO diga que chamou a equipe.",
                  }
                : {
                    ok: false,
                    error: forced.error,
                    instruction:
                      "Tente add_to_waitlist de novo só com phone. NÃO chame handoff_human.",
                  }
            ),
          });
          continue;
        }

        let exec = await executeTool(name, toolCtx, args);
        if (name === "add_to_waitlist" && !exec.ok) {
          exec = await executeTool("add_to_waitlist", toolCtx, {
            phone: input.phoneE164,
            notes: String(args.notes ?? "espera de horário"),
            desiredDate: args.desiredDate,
          });
        }
        toolCallsAudit.push({ name, ok: exec.ok });
        toolsFired.push(name);
        if (name === "handoff_human" && exec.ok) handoff = true;
        if (name === "book_appointment" && exec.ok) {
          await markBookingConfirmed(input.conversationId);
        }
        if (name === "reschedule_appointment" && exec.ok) {
          await markBookingConfirmed(input.conversationId);
        }
        if (name === "list_slots" && exec.ok && exec.data && typeof exec.data === "object") {
          const data = exec.data as {
            alternatives?: { label?: string }[];
            offerWaitlistOnlyAfterAlternatives?: boolean;
          };
          if (data.offerWaitlistOnlyAfterAlternatives && Array.isArray(data.alternatives)) {
            pendingAlternatives = data.alternatives
              .map((a) => a.label)
              .filter((x): x is string => Boolean(x))
              .slice(0, 3);
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify(exec.ok ? exec.data ?? { ok: true } : { ok: false, error: exec.error }),
        });
      }
      continue;
    }

    let reply = (result.content || "").replace(/\*\*/g, "").trim();
    if (!reply) {
      return {
        reply: "Pode me repetir, por favor? Quero te ajudar certo.",
        skills: skillsUsedFromTools(toolsFired),
        toolCalls: toolCallsAudit,
        handoff,
      };
    }

    if (
      pendingAlternatives.length >= 2 &&
      !/outro|alternativa|também|posso te|com o |com a |às \d|as \d|\d{1,2}:\d{2}/i.test(reply)
    ) {
      // Só força menu se a resposta não listou horários — evita estressar o cliente
      reply = `${reply}\n\nPosso te oferecer: ${pendingAlternatives.join("; ")}. Qual prefere?`;
    }

    // Rede de segurança (caso o short-circuit não tenha pegado)
    if (isSoftRefusalOfAlternatives(input.userText, history)) {
      reply = waitlistOfferReply();
    } else if (
      lastDonnaMessage(history) &&
      donnaOfferedAlternatives(lastDonnaMessage(history)!) &&
      !waitlistAlreadyOffered(history) &&
      !userPickedAlternative(input.userText) &&
      !/lista de espera|na espera|te aviso se liberar/i.test(reply) &&
      /até mais|quando quiser|é só chamar|se mudar de ideia|tenha uma|você também/i.test(reply)
    ) {
      reply = waitlistOfferReply();
    }

    return {
      reply,
      skills: skillsUsedFromTools(toolsFired),
      toolCalls: toolCallsAudit,
      handoff,
    };
  }

  return {
    reply: "Estou demorando um pouco para montar a resposta. Pode mandar de novo em uma frase?",
    skills: skillsUsedFromTools(toolsFired),
    toolCalls: toolCallsAudit,
    handoff,
  };
}
