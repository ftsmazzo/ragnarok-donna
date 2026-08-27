import type { AgentPersona, PersonaPatch } from "./types";
import { PERSONA_QA_CHECKLIST } from "./types";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Merge profundo — patch do tenant sobre defaults. */
export function mergePersona(base: AgentPersona, patch?: PersonaPatch | null): AgentPersona {
  if (!patch) return structuredClone(base);

  const out = structuredClone(base) as AgentPersona & Record<string, unknown>;

  function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
    for (const [key, val] of Object.entries(source)) {
      if (val === undefined) continue;
      if (Array.isArray(val)) {
        target[key] = val;
      } else if (isPlainObject(val) && isPlainObject(target[key])) {
        deepMerge(target[key] as Record<string, unknown>, val);
      } else {
        target[key] = val;
      }
    }
  }

  deepMerge(out as Record<string, unknown>, patch as Record<string, unknown>);
  return out as AgentPersona;
}

export function isPersonaEmpty(persona: unknown): boolean {
  if (!persona || typeof persona !== "object") return true;
  return Object.keys(persona as object).length === 0;
}

/** Gera systemPrompt a partir da persona estruturada (fonte para LLM). */
export function compilePersonaToSystemPrompt(
  persona: AgentPersona,
  agentDisplayName: string
): string {
  const p = persona.persona;
  const lines: string[] = [
    `Você é ${agentDisplayName}, recepção da ${persona.cliente.nome_negocio} (${persona.cliente.segmento}).`,
    `Essência: ${p.essencia}. Tom: ${p.tom.tracos.join(", ")}.`,
    `Trate o cliente por "${p.oralidade.forma_de_tratamento}".`,
    `Regra de ouro: ${p.regra_de_ouro}.`,
    `Tema em momentos de atrito: ${p.tema_emocional_central}.`,
    "",
    "Vocabulário preferido: " + p.vocabulario.termos_tecnicos.join(", ") + ".",
    "Nunca use: " + p.vocabulario.termos_proibidos.join(", ") + ".",
    "",
    "Expressões naturais (com moderação): " + p.oralidade.expressoes_tipicas.join(", ") + ".",
    "",
    "Nunca:",
    ...p.descaracteriza.map((d) => `- ${d}`),
    "",
    "Use apenas as tools disponíveis. Agendamentos → agenda; consumo → comanda.",
    "Se pedirem humano, use handoff_human.",
  ];

  if (persona.cliente.agente_representa === "recepção") {
    lines.push("Você fala como a equipe/marca — não como um barbeiro específico.");
  }

  if (p.historia_marca.usar && p.historia_marca.episodios.length > 0) {
    lines.push("", "Contexto da marca (use só se couber):");
    for (const ep of p.historia_marca.episodios) lines.push(`- ${ep}`);
  }

  lines.push("", "Fluxos de referência (adapte ao contexto, mantenha o tom):");
  for (const [key, msg] of Object.entries(persona.fluxos)) {
    lines.push(`- ${key}: ${msg}`);
  }

  lines.push("", "Checklist antes de responder:");
  for (const q of PERSONA_QA_CHECKLIST) lines.push(`- ${q}`);

  return lines.join("\n");
}

/** Saudação runtime para orquestrador heurístico / primeira resposta. */
export function pickGreeting(persona: AgentPersona, agentDisplayName: string): string {
  const fluxo = persona.fluxos.saudacao_inicial?.trim();
  if (fluxo) return fluxo;
  const oral = persona.persona.oralidade.saudacao_padrao?.trim();
  if (oral) return oral;
  return `Olá! Sou ${agentDisplayName}, recepção da ${persona.cliente.nome_negocio}.`;
}
