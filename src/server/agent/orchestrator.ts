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
import type { AgentSkillName, AgentToolName, OrchestratorInput, OrchestratorResult } from "./types";

function readPersona(raw: unknown): AgentPersona | null {
  if (!raw || typeof raw !== "object" || Object.keys(raw as object).length === 0) return null;
  return raw as AgentPersona;
}

function runtimeRules(businessName: string, displayName: string, phoneE164: string) {
  return `
Você é ${displayName}, recepção da ${businessName}, no WhatsApp.
Timezone: America/Sao_Paulo. Telefone desta conversa: ${phoneE164}.

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
11. Nunca invente horário, produto ou preço. Nunca diga que é IA/bot.
12. Resposta final = só o texto do WhatsApp.
13. LISTA DE ESPERA: se o cliente pediu um horário e list_slots indicar preferredHourOccupied=true (ou a hora não aparecer nos slots), na MESMA mensagem ofereça alternativas E pergunte se quer entrar na lista de espera daquele horário. Nunca responda só com outras horas sem mencionar a espera.
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
  /** Se list_slots marcou horário pedido ocupado, garante oferta de espera na resposta final. */
  let waitlistOfferHour: number | null = null;

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
        if (name === "list_slots" && (args.preferredHour == null || args.preferredHour === "")) {
          // Histórico + msg atual: "as 17" / "17h" / "17:00" (não pegar dia 1/9)
          const corpus = `${history.join("\n")}\n${input.userText}`;
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
        if (name === "add_to_waitlist" && !args.phone && !args.phoneE164 && !args.clientId) {
          args.phone = input.phoneE164;
        }
        if (name === "send_whatsapp" && !args.phoneE164) args.phoneE164 = input.phoneE164;
        const exec = await executeTool(name, toolCtx, args);
        toolCallsAudit.push({ name, ok: exec.ok });
        toolsFired.push(name);
        if (name === "handoff_human" && exec.ok) handoff = true;
        if (name === "list_slots" && exec.ok && exec.data && typeof exec.data === "object") {
          const data = exec.data as {
            waitlistOffer?: boolean;
            preferredHour?: number | null;
          };
          if (data.waitlistOffer && data.preferredHour != null) {
            waitlistOfferHour = Number(data.preferredHour);
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
      waitlistOfferHour != null &&
      !/lista de espera|entrar na espera|na espera|fila de espera|me avisa se liberar/i.test(reply)
    ) {
      const hh = String(waitlistOfferHour).padStart(2, "0");
      reply = `${reply}\n\nSe preferir manter as ${hh}h, posso te colocar na lista de espera e te aviso se liberar. Quer?`;
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
