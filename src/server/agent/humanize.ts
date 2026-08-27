import { compilePersonaToSystemPrompt, type AgentPersona } from "./persona";
import { chatCompletion, getLlmConfig } from "./llm";

export type HumanizeFacts = {
  userText: string;
  draftReply: string;
  firstName?: string | null;
  pastServices?: string[];
  lastServiceName?: string | null;
  offerPastService?: string | null;
  dayLabel?: string | null;
  period?: string | null;
  serviceName?: string | null;
  slots?: string[];
  booked?: { service: string; when: string; staff: string } | null;
  intent:
    | "greet"
    | "ask_details"
    | "offer_slots"
    | "booked"
    | "handoff"
    | "generic";
};

const WHATSAPP_RULES = `
Regras de WhatsApp (obrigatórias):
- Responda SÓ a mensagem final ao cliente (sem aspas, sem JSON, sem explicação).
- Curta: 1 a 3 frases. Tom de recepção humana, calorosa e direta.
- Sem markdown (sem *, listas com bullet, títulos).
- Não invente horário, preço ou disponibilidade — use só os FATOS.
- Se houver serviço que o cliente já fez, ofereça de forma natural (ex.: "da última vez foi X — quer repetir?").
- Não diga que é IA/bot. Não use a palavra "encaixar".
- Se houver opções de horário, numere 1) 2) 3) em linhas simples.
`.trim();

export async function humanizeReply(input: {
  persona: AgentPersona | null;
  displayName: string;
  systemPrompt?: string | null;
  model?: string | null;
  temperature?: number | null;
  facts: HumanizeFacts;
}): Promise<string> {
  const fallback = input.facts.draftReply.trim();
  if (!getLlmConfig()) return fallback;

  const basePrompt =
    input.systemPrompt?.trim() ||
    (input.persona
      ? compilePersonaToSystemPrompt(input.persona, input.displayName)
      : `Você é ${input.displayName}, recepção de uma barbearia.`);

  const factsBlock = [
    `Intenção: ${input.facts.intent}`,
    input.facts.firstName ? `Nome do cliente: ${input.facts.firstName}` : null,
    input.facts.lastServiceName
      ? `Último serviço: ${input.facts.lastServiceName}`
      : null,
    input.facts.pastServices?.length
      ? `Serviços que já fez: ${input.facts.pastServices.join(", ")}`
      : null,
    input.facts.offerPastService
      ? `Sugerir reoferta de: ${input.facts.offerPastService}`
      : null,
    input.facts.dayLabel ? `Dia: ${input.facts.dayLabel}` : null,
    input.facts.period ? `Período: ${input.facts.period}` : null,
    input.facts.serviceName ? `Serviço em pauta: ${input.facts.serviceName}` : null,
    input.facts.slots?.length ? `Horários livres:\n${input.facts.slots.join("\n")}` : null,
    input.facts.booked
      ? `Agendamento confirmado: ${input.facts.booked.service} — ${input.facts.booked.when} com ${input.facts.booked.staff}`
      : null,
    `Rascunho (pode reescrever mantendo os fatos):\n${fallback}`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Cliente disse: """${input.facts.userText}"""`,
    "",
    "FATOS (não invente além disso):",
    factsBlock,
    "",
    "Escreva a resposta final no WhatsApp.",
  ].join("\n");

  const temp =
    typeof input.temperature === "number"
      ? Math.min(1, Math.max(0, input.temperature / 100))
      : 0.55;

  const out = await chatCompletion({
    model: input.model || "openai/gpt-4.1-mini",
    system: `${basePrompt}\n\n${WHATSAPP_RULES}`,
    user,
    temperature: temp,
    maxTokens: 220,
  });

  if (!out) return fallback;
  return out
    .replace(/^["“]|["”]$/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

/** Escolhe o melhor serviço do histórico para reoferecer. */
export function pickOfferFromHistory(input: {
  lastServiceName?: string | null;
  pastServices?: string[];
  preferCombo?: boolean;
}): string | null {
  const list = [
    ...(input.lastServiceName ? [input.lastServiceName] : []),
    ...(input.pastServices ?? []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  if (!list.length) return null;

  const isCombo = (n: string) =>
    /combo|corte\s*\+?\s*barba|barba\s*\+?\s*corte|corte\s*e\s*barba/i.test(n);

  if (input.preferCombo) {
    const combo = list.find(isCombo);
    if (combo) return combo;
  }

  // Evita reoferecer só "Sobrancelhas" se houver corte/combo no histórico
  const hair = list.find((n) => /corte|barba|combo|degrad|cabelo/i.test(n));
  return hair || list[0];
}

/** Oferta humanizada de serviço já feito (fallback sem LLM). */
export function craftPastServiceOffer(input: {
  firstName?: string | null;
  offerService: string;
  dayLabel?: string | null;
  askingSchedule?: boolean;
}): string {
  const hi = input.firstName ? `Oi, ${input.firstName}!` : "Oi!";
  const day = input.dayLabel ? ` no ${input.dayLabel}` : "";
  const svc = input.offerService;

  if (input.askingSchedule) {
    return `${hi} Vi aqui que da última vez foi ${svc}. Quer repetir${day}, ou prefere outro serviço? Me fala também se é manhã ou tarde.`;
  }
  return `${hi} Que bom te ver por aqui. Da última vez foi ${svc} — quer repetir ou prefere outra coisa?`;
}
