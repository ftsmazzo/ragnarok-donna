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
import { chatCompletion, getLlmConfig, type ChatMessage } from "./llm";
import { compilePersonaToSystemPrompt, type AgentPersona } from "./persona";
import {
  buildToolsForSkills,
  compileSkillsBlock,
  listEnabledSkills,
  skillsUsedFromTools,
} from "./skills";
import { executeTool } from "./tools";
import { buildCalendarContext, resolveTemporalPhrase } from "./temporal";
import type { AgentSkillName, AgentToolName, OrchestratorInput, OrchestratorResult } from "./types";

function readPersona(raw: unknown): AgentPersona | null {
  if (!raw || typeof raw !== "object" || Object.keys(raw as object).length === 0) return null;
  return raw as AgentPersona;
}

function runtimeRules(businessName: string, displayName: string, phoneE164: string) {
  return `
Você é ${displayName}, recepção da ${businessName}, no WhatsApp.
Timezone: America/Sao_Paulo. Telefone desta conversa: ${phoneE164}.

${buildCalendarContext()}

REGRAS:
1. Responda a pergunta real. Não desvie para oferta se pediram outra coisa (ex.: listar agendamentos).
2. Use as SKILLS e as TOOLS antes de afirmar fato de agenda, preço, histórico ou disponibilidade.
3. Em find_client / list_client_appointments use o telefone acima se faltar argumento.
4. Para conferir agendas: SEMPRE list_client_appointments. Liste TODOS os itens retornados, do mais próximo ao mais longe. Nunca invente dia da semana — use o campo label/weekday da tool.
5. Para "última vez que fiz X": find_client com serviceQuery e use lastServiceMatch.label (tem data). recentServices também vem com dateBr/label — não diga que não tem data se a tool trouxe.
6. Produtos à venda (balm, pomada, etc.): list_products com query — responda nome + priceLabel. Não diga que não tem acesso se a tool retornar itens.
7. find_client.nextAppointment = mais próximo; lastAppointment = passado. Não use lastAppointment como se fosse o próximo.
8. Mensagens curtas (1–4 frases), humanas, calorosas. Sem markdown.
9. Áudio transcrito chega como texto — responda ao que o cliente disse, sem avisar que "não ouve áudio".
10. Oferta de serviço do histórico só quando couber (saudação / novo agendamento) — nunca no lugar de uma consulta.
11. Nunca invente horário, produto, preço ou dia da semana. Nunca diga que é IA/bot.
12. Resposta final = só o texto do WhatsApp.
13. HORÁRIO OCUPADO: (1) ofereça 2–3 alternativas; (2) se o cliente recusar as alternativas, OFEREÇA a lista de espera ANTES de se despedir; (3) só se recusar também a espera, aí encerre. Nunca diga "até mais" logo após a recusa das alternativas sem mencionar a espera.
14. LISTA DE ESPERA: quando o cliente aceitar esperar, chame add_to_waitlist com o telefone da conversa. NUNCA use handoff_human por falha ou sucesso da espera — a Donna resolve sozinha. Se a tool falhar, peça desculpa e tente de novo (ou confirme telefone), sem chamar a equipe.
15. DATAS: para "próxima segunda", "amanhã", "quarta que vem", "1/9" etc. chame resolve_date (ou list_slots com datePhrase). Fale sempre o weekday do CALENDÁRIO / dateLabel da tool. Se o cliente disser "segunda 1/9" e 1/9 for terça, corrija com educação usando o note da tool.
`.trim();
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
    runtimeRules(businessName, displayName, input.phoneE164),
  ]
    .filter(Boolean)
    .join("\n\n");

  const history = await loadRecentThread(input.conversationId);
  const historyBlock = history.length
    ? `Histórico recente:\n${history.join("\n")}`
    : "Histórico: (início da conversa)";

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

  const model =
    process.env.LLM_MODEL?.trim() ||
    profile?.model ||
    "anthropic/claude-sonnet-4.6";
  const temperature =
    typeof profile?.temperature === "number" ? Math.min(1, Math.max(0, profile.temperature / 100)) : 0.45;

  const toolCtx = {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    agentProfileId: profile?.id,
  };

  for (let step = 0; step < 6; step += 1) {
    const result = await chatCompletion({
      model,
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
        if (name === "list_slots") {
          const missingDate =
            !args.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(args.date));
          if (missingDate && !args.datePhrase) {
            const inboundOnly = history
              .filter((l) => l.startsWith("cliente:"))
              .map((l) => l.replace(/^cliente:\s*/i, ""))
              .join("\n");
            const guessed =
              resolveTemporalPhrase(input.userText) ||
              resolveTemporalPhrase(`${inboundOnly}\n${input.userText}`);
            if (guessed) {
              args.date = guessed.date;
              args.datePhrase = input.userText;
            }
          }
          if (args.preferredHour == null || args.preferredHour === "") {
            const corpus = `${history
              .filter((l) => l.startsWith("cliente:"))
              .join("\n")}\n${input.userText}`;
            const timeRe =
              /(?:às|as|á)\s*(\d{1,2})\s*h?\b|(\d{1,2})\s*h\b|(\d{1,2}):00\b/gi;
            let inferred: number | null = null;
            let m: RegExpExecArray | null;
            while ((m = timeRe.exec(corpus))) {
              const h = Number(m[1] || m[2] || m[3]);
              if (h >= 7 && h <= 22) inferred = h;
            }
            if (inferred != null) args.preferredHour = inferred;
          }
        }
        if (name === "resolve_date" && !args.phrase) {
          args.phrase = input.userText;
        }
        if (name === "add_to_waitlist") {
          if (!args.phone && !args.phoneE164) args.phone = input.phoneE164;
          waitlistAcceptedThisTurn = true;
        }
        if (name === "send_whatsapp" && !args.phoneE164) args.phoneE164 = input.phoneE164;

        // Lista de espera é 100% Donna — não escalar para humano nesse fluxo
        if (
          name === "handoff_human" &&
          (waitlistAcceptedThisTurn ||
            /espera|lista de espera|me avisa se liberar|quero sim/i.test(input.userText))
        ) {
          const forced = await executeTool("add_to_waitlist", toolCtx, {
            phone: input.phoneE164,
            notes: String(args.reason ?? args.notes ?? "cliente pediu lista de espera"),
            desiredDate: args.desiredDate,
            staffId: args.staffId,
            serviceId: args.serviceId,
            clientId: args.clientId,
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
      !/outro|alternativa|também|posso te|com o |com a /i.test(reply)
    ) {
      reply = `${reply}\n\nPosso te oferecer: ${pendingAlternatives.join("; ")}. Qual prefere? Se nenhuma servir, aí te coloco na lista de espera.`;
    }

    // Recusou alternativas → garantir oferta de espera antes do adeus
    const lastDonna = [...history].reverse().find((h) => h.startsWith("donna:"));
    const donnaJustOfferedAlts = Boolean(
      lastDonna &&
        /(opções|opcoes|alternativa|\b1\.|às \d{1,2}h com|as \d{1,2}h com|Qual dessas)/i.test(
          lastDonna
        )
    );
    const waitlistAlreadyOffered = history.some(
      (h) =>
        h.startsWith("donna:") &&
        /lista de espera|te coloco na espera|na espera|te aviso se liberar|me avisa se liberar/i.test(
          h
        )
    );
    const userRefusedAlts =
      /não me interessa|nao me interessa|nenhuma|não quero|nao quero|não serve|nao serve|deixa pra l[aá]|pode deixar|não|nao|obrigad/i.test(
        input.userText
      ) && !/espera|me avisa|coloca na|lista|quero a |quero a\d|sim|pode colocar/i.test(input.userText);
    const replyHasWaitlist =
      /lista de espera|na espera|te coloco na espera|te aviso se liberar|me avisa se liberar/i.test(
        reply
      );

    if (
      donnaJustOfferedAlts &&
      userRefusedAlts &&
      !waitlistAlreadyOffered &&
      !replyHasWaitlist
    ) {
      reply =
        "Sem problema! Antes de encerrar: quer que eu te coloque na lista de espera do horário que você pediu? Se liberar, te aviso aqui no Zap.";
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
