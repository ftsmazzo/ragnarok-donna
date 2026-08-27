import { and, count, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { executeTool, listToolDefinitions } from "./tools";
import { pickGreeting, type AgentPersona } from "./persona";
import type { OrchestratorInput, OrchestratorResult, AgentSkillName } from "./types";

function readPersona(raw: unknown): AgentPersona | null {
  if (!raw || typeof raw !== "object" || Object.keys(raw as object).length === 0) return null;
  return raw as AgentPersona;
}

function formatMoneyBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function detectDayHint(text: string): string | null {
  if (/s[aá]bado/.test(text)) return "sábado";
  if (/domingo/.test(text)) return "domingo";
  if (/segunda/.test(text)) return "segunda";
  if (/ter[cç]a/.test(text)) return "terça";
  if (/quarta/.test(text)) return "quarta";
  if (/quinta/.test(text)) return "quinta";
  if (/sexta/.test(text)) return "sexta";
  if (/hoje/.test(text)) return "hoje";
  if (/amanh[aã]/.test(text)) return "amanhã";
  return null;
}

function detectServiceHint(text: string): string | null {
  if (/combo/.test(text)) return "combo";
  if (/barba/.test(text)) return "barba";
  if (/corte|cabelo|degrad[eê]/.test(text)) return "corte";
  return null;
}

function pickMatchingServices(
  services: { name: string; durationMin: number; priceCents: number }[],
  hint: string | null
) {
  if (!services.length) return [];
  if (!hint) return services.slice(0, 4);
  const re =
    hint === "corte"
      ? /corte|cabelo|degrad/i
      : hint === "barba"
        ? /barba/i
        : /combo|corte.*barba|barba.*corte/i;
  const matched = services.filter((s) => re.test(s.name));
  return (matched.length ? matched : services).slice(0, 4);
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

async function countPriorAiReplies(conversationId: string) {
  const db = createDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.direction, "outbound_ai")
      )
    );
  return Number(row?.n ?? 0);
}

/**
 * Orquestrador v0.1 (heurístico, sem LLM):
 * - mode=human → silêncio
 * - não manda texto de debug ("Detectei intenção…")
 * - só saúda na 1ª resposta da conversa
 * - Agendar: lista serviços reais e pede horário preferido
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  if (input.mode === "human") {
    return { reply: null, skills: [], toolCalls: [] };
  }

  const profile = await getDefaultAgentProfile(input.tenantId);
  const displayName = profile?.displayName || profile?.name || "Assistente";
  const persona = readPersona(profile?.persona);
  const enabled = listToolDefinitions(profile?.toolsEnabled ?? undefined);
  const toolCalls: OrchestratorResult["toolCalls"] = [];

  const text = input.userText.toLowerCase();
  const skills: AgentSkillName[] = [];
  if (/agend|marcar|hor[aá]rio|reserv|tem vaga|dispon/.test(text)) skills.push("skill.schedule");
  if (/comanda|servi[cç]o|cortar|barba|corte|combo/.test(text)) {
    if (!skills.includes("skill.schedule")) skills.push("skill.schedule");
    skills.push("skill.order");
  }
  if (/voltar|sumiu|faz tempo|saudade/.test(text)) skills.push("skill.followup");
  if (/atendente|humano|pessoa|recep[cç]/.test(text)) skills.push("skill.handoff");

  if (skills.includes("skill.handoff") && enabled.some((t) => t.name === "handoff_human")) {
    const r = await executeTool("handoff_human", {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      agentProfileId: profile?.id,
    });
    toolCalls.push({ name: "handoff_human", ok: r.ok });
    return {
      reply: r.ok
        ? `Claro — já chamei alguém da equipe. Em instantes um humano assume por aqui.`
        : `Não consegui transferir agora. Tente de novo em instantes.`,
      skills,
      toolCalls,
      handoff: r.ok,
    };
  }

  const priorAi = await countPriorAiReplies(input.conversationId);
  const isFirstReply = priorAi === 0;
  const greeting = persona
    ? pickGreeting(persona, displayName)
    : `Olá! Sou ${displayName}.`;

  const dayHint = detectDayHint(text);
  const serviceHint = detectServiceHint(text);
  const wantsSchedule =
    skills.includes("skill.schedule") || Boolean(dayHint) || Boolean(serviceHint);

  if (wantsSchedule && enabled.some((t) => t.name === "list_services")) {
    const r = await executeTool(
      "list_services",
      {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        agentProfileId: profile?.id,
      },
      {}
    );
    toolCalls.push({ name: "list_services", ok: r.ok });

    const services = Array.isArray(r.data?.services)
      ? (r.data.services as { name: string; durationMin: number; priceCents: number }[])
      : [];
    const picks = pickMatchingServices(services, serviceHint);
    const serviceLines = picks.map(
      (s) => `• ${s.name} (${s.durationMin} min) — ${formatMoneyBRL(s.priceCents)}`
    );

    const dayPart = dayHint
      ? `Para ${dayHint}`
      : "Para agendar";
    const servicePart = serviceHint
      ? serviceHint === "corte"
        ? "corte"
        : serviceHint
      : "o serviço";

    const bodyParts: string[] = [];
    if (isFirstReply) bodyParts.push(greeting);

    bodyParts.push(
      `${dayPart}, consigo te encaixar — me confirma só ${servicePart === "corte" ? "se é só corte ou combo (corte + barba)" : `se é ${servicePart}`} e se prefere manhã ou tarde.`
    );

    if (serviceLines.length) {
      bodyParts.push(`Opções que temos:\n${serviceLines.join("\n")}`);
    } else {
      bodyParts.push("Me diga o serviço e o horário que você prefere que eu verifico na agenda.");
    }

    return {
      reply: bodyParts.join("\n\n").trim(),
      skills: skills.length ? skills : ["skill.schedule"],
      toolCalls,
    };
  }

  if (/oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|opa/.test(text) || isFirstReply) {
    return {
      reply: `${greeting} Posso te ajudar a agendar, tirar dúvida de serviço ou chamar a recepção. O que você precisa?`.trim(),
      skills,
      toolCalls,
    };
  }

  return {
    reply:
      "Entendi. Posso agendar um horário, falar de serviços/preços ou chamar alguém da equipe — o que prefere?",
    skills,
    toolCalls,
  };
}
