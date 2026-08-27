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
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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
  if (/combo|corte\s*\+?\s*barba|corte\s*e\s*barba/.test(text)) return "combo";
  if (/barba/.test(text) && !/corte/.test(text)) return "barba";
  if (/corte|cabelo|degrad[eê]/.test(text)) return "corte";
  return null;
}

function isComboName(name: string) {
  return /combo|corte\s*\+?\s*barba|barba\s*\+?\s*corte|corte\s*e\s*barba/i.test(name);
}

type ServiceRow = { name: string; durationMin: number; priceCents: number };

function pickRelevantService(services: ServiceRow[], hint: string | null, prefersCombo: boolean) {
  if (!services.length) return null;
  const want = prefersCombo && !hint ? "combo" : hint;
  if (want === "combo") {
    return services.find((s) => isComboName(s.name)) ?? services[0];
  }
  if (want === "barba") {
    return services.find((s) => /barba/i.test(s.name) && !isComboName(s.name)) ?? services[0];
  }
  if (want === "corte") {
    return (
      services.find((s) => /corte/i.test(s.name) && !isComboName(s.name) && !/barba/i.test(s.name)) ??
      services.find((s) => /corte/i.test(s.name)) ??
      services[0]
    );
  }
  return services[0];
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

type ClientCtx = {
  found: boolean;
  firstName?: string;
  prefersCombo?: boolean;
  lastServiceName?: string | null;
  openOrder?: { id: string } | null;
};

function buildScheduleReply(input: {
  isFirstReply: boolean;
  greeting: string;
  dayHint: string | null;
  serviceHint: string | null;
  client: ClientCtx;
  service: ServiceRow | null;
}): string {
  const { isFirstReply, greeting, dayHint, serviceHint, client, service } = input;
  const day = dayHint ?? "esse dia";
  const name = client.firstName;
  const hi = name ? `Oi, ${name}!` : isFirstReply ? greeting.replace(/\s*Como posso te ajudar hoje\??\s*$/i, "").trim() : "Oi!";

  // Cliente conhecido + costuma combo / último combo
  if (client.found && (client.prefersCombo || (client.lastServiceName && isComboName(client.lastServiceName)))) {
    const habitual = client.lastServiceName && isComboName(client.lastServiceName)
      ? client.lastServiceName
      : "Corte+Barba";
    const price = service && isComboName(service.name)
      ? ` (${formatMoneyBRL(service.priceCents)})`
      : "";
    return [
      `${hi} Vi aqui que você costuma fazer ${habitual}${price}.`,
      `Quer o mesmo no ${day}? Me fala se prefere de manhã ou à tarde que eu olho a agenda.`,
    ].join(" ");
  }

  // Cliente conhecido + último serviço
  if (client.found && client.lastServiceName) {
    return [
      `${hi} Vi que da última vez foi ${client.lastServiceName}.`,
      serviceHint === "corte"
        ? `No ${day} você quer só o corte de novo, ou prefere o combo com barba? Manhã ou tarde?`
        : `Quer repetir no ${day}, ou muda o serviço? Me fala também se prefere manhã ou tarde.`,
    ].join(" ");
  }

  // Cliente conhecido sem histórico
  if (client.found) {
    if (serviceHint === "corte") {
      return `${hi} Beleza — pro ${day}, é só corte ou você quer o combo (corte + barba)? Prefere manhã ou tarde?`;
    }
    return `${hi} Posso olhar a agenda pro ${day}. Qual serviço você quer e se prefere manhã ou tarde?`;
  }

  // Desconhecido
  if (serviceHint === "corte") {
    const priceBit = service ? ` O corte tá ${formatMoneyBRL(service.priceCents)}.` : "";
    return `${hi}${priceBit} Pro ${day}, confirma pra mim: só corte ou combo com barba? E manhã ou tarde?`;
  }

  if (service) {
    return `${hi} Pro ${day} consigo ver horário sim. Me diz o serviço (tipo ${service.name}) e se prefere manhã ou tarde.`;
  }

  return `${hi} Pro ${day} consigo ver horário. Me diz o serviço e se prefere manhã ou tarde.`;
}

/**
 * Orquestrador v0.2 — heurístico, tom de recepção no WhatsApp.
 * Usa find_client (telefone) + histórico pra personalizar.
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
  const toolCtx = {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    agentProfileId: profile?.id,
  };

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
    const r = await executeTool("handoff_human", toolCtx);
    toolCalls.push({ name: "handoff_human", ok: r.ok });
    return {
      reply: r.ok
        ? `Claro — já chamei alguém da equipe. Em instantes alguém assume por aqui.`
        : `Não consegui transferir agora. Tenta de novo em instantes?`,
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

  let clientCtx: ClientCtx = { found: false };
  if (enabled.some((t) => t.name === "find_client")) {
    const r = await executeTool("find_client", toolCtx, { phoneE164: input.phoneE164 });
    toolCalls.push({ name: "find_client", ok: r.ok });
    if (r.ok && r.data?.found) {
      const c = r.data.client as { firstName?: string } | undefined;
      clientCtx = {
        found: true,
        firstName: c?.firstName,
        prefersCombo: Boolean(r.data.prefersCombo),
        lastServiceName: (r.data.lastServiceName as string | null | undefined) ?? null,
        openOrder: (r.data.openOrder as { id: string } | null) ?? null,
      };
    }
  }

  if (wantsSchedule) {
    let service: ServiceRow | null = null;
    if (enabled.some((t) => t.name === "list_services")) {
      const r = await executeTool("list_services", toolCtx);
      toolCalls.push({ name: "list_services", ok: r.ok });
      const services = Array.isArray(r.data?.services) ? (r.data.services as ServiceRow[]) : [];
      service = pickRelevantService(services, serviceHint, Boolean(clientCtx.prefersCombo));
    }

    const reply = buildScheduleReply({
      isFirstReply,
      greeting,
      dayHint,
      serviceHint,
      client: clientCtx,
      service,
    });

    return {
      reply,
      skills: skills.length ? skills : ["skill.schedule"],
      toolCalls,
    };
  }

  if (clientCtx.found && clientCtx.firstName) {
    return {
      reply: `Oi, ${clientCtx.firstName}! Em que posso te ajudar — agendar, dúvida de serviço ou falar com a recepção?`,
      skills,
      toolCalls,
    };
  }

  if (/oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|opa/.test(text) || isFirstReply) {
    return {
      reply: `${greeting} Posso te ajudar a agendar, tirar dúvida ou chamar a recepção. O que você precisa?`.trim(),
      skills,
      toolCalls,
    };
  }

  return {
    reply: "Posso agendar um horário, falar de serviços ou chamar alguém da equipe — o que prefere?",
    skills,
    toolCalls,
  };
}
