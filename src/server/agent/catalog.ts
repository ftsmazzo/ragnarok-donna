import type { AgentSkillDefinition, AgentToolDefinition } from "./types";

/** Catálogo fechado v1 — implementações entram nas fases 6.3+ */
export const TOOL_CATALOG: AgentToolDefinition[] = [
  {
    name: "get_unit_context",
    description: "Contexto da unidade: nome, profissionais bookable, timezone",
    skills: ["skill.schedule", "skill.order", "skill.followup"],
  },
  {
    name: "find_client",
    description: "Busca cliente por telefone ou nome no tenant",
    skills: ["skill.schedule", "skill.order", "skill.followup"],
  },
  {
    name: "list_services",
    description: "Lista serviços ativos (preço, duração, comissão)",
    skills: ["skill.schedule", "skill.order"],
  },
  {
    name: "list_slots",
    description: "Horários livres na agenda por profissional/data",
    skills: ["skill.schedule"],
  },
  {
    name: "book_appointment",
    description: "Cria agendamento na agenda operacional",
    skills: ["skill.schedule"],
  },
  {
    name: "cancel_appointment",
    description: "Cancela ou marca ausência em agendamento",
    skills: ["skill.schedule", "skill.handoff"],
  },
  {
    name: "open_order",
    description: "Abre comanda (opcionalmente ligada ao appointment)",
    skills: ["skill.order"],
  },
  {
    name: "add_order_item",
    description: "Adiciona serviço/produto na comanda aberta",
    skills: ["skill.order"],
  },
  {
    name: "list_followups",
    description: "Lista retorno 60–100d / recorrência parada (insights)",
    skills: ["skill.followup"],
  },
  {
    name: "handoff_human",
    description: "Passa conversa para modo humano (recepção)",
    skills: ["skill.handoff"],
  },
  {
    name: "send_whatsapp",
    description: "Envia mensagem via Evolution",
    skills: ["skill.followup"],
    needsWhatsApp: true,
  },
];

export const SKILL_CATALOG: AgentSkillDefinition[] = [
  {
    name: "skill.schedule",
    title: "Agendar",
    description: "Identifica cliente, serviço e horário → grava appointment",
    tools: [
      "get_unit_context",
      "find_client",
      "list_services",
      "list_slots",
      "book_appointment",
    ],
  },
  {
    name: "skill.order",
    title: "Comanda",
    description: "Abre comanda e adiciona itens de consumo",
    tools: ["find_client", "list_services", "open_order", "add_order_item"],
  },
  {
    name: "skill.followup",
    title: "Follow-up",
    description: "Usa lista de retorno/recorrência e agenda/envia convite",
    tools: ["list_followups", "find_client", "send_whatsapp"],
  },
  {
    name: "skill.handoff",
    title: "Handoff",
    description: "Transfere para humano no painel Conversas",
    tools: ["handoff_human"],
  },
];
