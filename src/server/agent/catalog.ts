import type { AgentSkillDefinition, AgentToolDefinition } from "./types";

/** Catálogo fechado v1 */
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
    name: "list_products",
    description: "Lista produtos à venda (nome, marca, preço, estoque)",
    skills: ["skill.order", "skill.schedule"],
  },
  {
    name: "list_slots",
    description: "Horários livres na agenda por profissional/data",
    skills: ["skill.schedule"],
  },
  {
    name: "list_client_appointments",
    description: "Lista agendamentos do cliente (hoje, semana, período)",
    skills: ["skill.schedule", "skill.handoff"],
  },
  {
    name: "resolve_date",
    description:
      "Converte frase temporal (próxima segunda, amanhã, 1/9, quarta que vem) em data real + weekday SP",
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
    name: "list_open_orders",
    description: "Lista comandas abertas com valores (geral ou por telefone/cliente)",
    skills: ["skill.order", "skill.handoff"],
  },
  {
    name: "add_to_waitlist",
    description: "Insere cliente na lista de espera quando o horário desejado está ocupado",
    skills: ["skill.schedule"],
  },
  {
    name: "list_waitlist",
    description: "Consulta a lista de espera (waiting/notified)",
    skills: ["skill.schedule", "skill.handoff"],
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
    skills: ["skill.followup", "skill.schedule"],
    needsWhatsApp: true,
  },
];

export const SKILL_CATALOG: AgentSkillDefinition[] = [
  {
    name: "skill.schedule",
    title: "Agendar",
    description: "Identifica cliente, serviço e horário → grava appointment / espera",
    tools: [
      "get_unit_context",
      "find_client",
      "list_services",
      "list_products",
      "list_slots",
      "list_client_appointments",
      "resolve_date",
      "book_appointment",
      "cancel_appointment",
      "add_to_waitlist",
      "list_waitlist",
      "send_whatsapp",
    ],
  },
  {
    name: "skill.order",
    title: "Comanda",
    description: "Catálogo, comandas abertas e valores",
    tools: [
      "find_client",
      "list_services",
      "list_products",
      "open_order",
      "add_order_item",
      "list_open_orders",
    ],
  },
  {
    name: "skill.followup",
    title: "Follow-up",
    description: "Usa lista de retorno/recorrência e envia WhatsApp",
    tools: ["list_followups", "find_client", "send_whatsapp"],
  },
  {
    name: "skill.handoff",
    title: "Handoff",
    description: "Transfere para humano e consulta operação",
    tools: ["handoff_human", "list_open_orders", "list_waitlist", "list_client_appointments"],
  },
];
