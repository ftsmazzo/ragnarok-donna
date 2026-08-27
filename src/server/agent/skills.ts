import { SKILL_CATALOG, TOOL_CATALOG } from "./catalog";
import type { ChatToolDef } from "./llm";
import type { AgentSkillName, AgentToolName } from "./types";

/** Playbooks: skill mune a Donna com o que fazer e quais tools usar. */
const SKILL_PLAYBOOKS: Record<AgentSkillName, string> = {
  "skill.schedule": `SKILL.SCHEDULE — agenda WhatsApp
Quando o cliente quer marcar, remarcar, cancelar, ver horários livres OU conferir agendamentos dele:
1. find_client (telefone da conversa) para identificar.
2. "Última vez que fiz X" / histórico de serviço → find_client com serviceQuery="X". Responda com lastServiceMatch.label (data+dia). Se lastServiceMatch for null, diga que não achou no histórico — não invente e não diga "sem data" se recentServices tiver a data.
3. Conferir agendas → SEMPRE list_client_appointments (nunca invente a partir de lastAppointment).
   - "essa semana" → range=week
   - "hoje" → range=today
   - genérico / próximos → range=upcoming (padrão)
   - "só o próximo" → range=next
   - "antes de DD/MM" → beforeDate=YYYY-MM-DD
4. A tool devolve appointments ORDENADOS do mais próximo ao mais longe + campo label com weekday correto.
   → Liste TODOS os retornados (ou diga que não há). Nunca cite só o mais longe. Nunca invente dia da semana.
5. Marcar → list_services → list_slots → confirme → book_appointment.
6. Cancelar → list_client_appointments → cancel_appointment com o id.
7. Endereço / horário / sobre a loja → get_unit_context (ou use os DADOS DA UNIDADE do system prompt). Nunca cite WhatsApp antigo do site.
Nunca invente horário.`,

  "skill.order": `SKILL.ORDER — produtos e comanda
Quando o cliente pergunta sobre produto à venda (balm, pomada, shampoo, óleo, kit…):
→ list_products com query (ex.: "balm", "barba"). Responda com nome + priceLabel.
Se count=0, diga que não encontrou no estoque de venda e ofereça chamar a equipe — não invente.
Para comanda na loja: find_client → open_order / add_order_item (se disponíveis).`,

  "skill.followup": `SKILL.FOLLOWUP — retorno
Quando for convite de retorno / cliente sumido:
list_followups / find_client. Não force oferta se o cliente pediu outra coisa.`,

  "skill.handoff": `SKILL.HANDOFF — humano
Se pedirem recepção/gerente/humano, ou se você travar:
chame handoff_human e avise que a equipe vai assumir.`,
};

const TOOL_SCHEMAS: Record<AgentToolName, ChatToolDef> = {
  find_client: {
    type: "function",
    function: {
      name: "find_client",
      description:
        "Identifica o cliente pelo telefone. Devolve histórico de serviços COM DATA (recentServices/lastServiceMatch). Para 'última vez que fiz X', passe serviceQuery.",
      parameters: {
        type: "object",
        properties: {
          phoneE164: { type: "string" },
          serviceQuery: {
            type: "string",
            description: "Nome do serviço a buscar no histórico (ex.: hidratação de barba)",
          },
        },
        required: ["phoneE164"],
      },
    },
  },
  list_client_appointments: {
    type: "function",
    function: {
      name: "list_client_appointments",
      description:
        "Lista agendas ATIVAS do cliente do mais próximo ao mais longe. Obrigatório para conferir/ver horários. Retorna label com dia da semana correto.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          phoneE164: { type: "string" },
          range: {
            type: "string",
            enum: ["today", "week", "upcoming", "next", "all"],
            description:
              "today=hoje; week=semana atual (seg–dom SP); upcoming=próximos 60d (padrão); next=só o mais próximo; all=120d",
          },
          beforeDate: {
            type: "string",
            description: "YYYY-MM-DD — só agendas ANTES deste dia (ex.: cliente pergunta se tem algo antes de uma data)",
          },
          afterDate: {
            type: "string",
            description: "YYYY-MM-DD — só agendas depois deste dia",
          },
        },
      },
    },
  },
  list_services: {
    type: "function",
    function: {
      name: "list_services",
      description: "Lista serviços ativos com preço e duração. Opcional: query para filtrar pelo nome.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Filtro opcional (ex.: corte, barba)" } },
      },
    },
  },
  list_products: {
    type: "function",
    function: {
      name: "list_products",
      description:
        "Lista produtos à venda na loja com preço (priceLabel). Use quando perguntarem balm, pomada, shampoo, óleo, etc. Passe query para filtrar.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Filtro (ex.: balm, barba, pomada). Vazio = catálogo de venda.",
          },
        },
      },
    },
  },
  list_slots: {
    type: "function",
    function: {
      name: "list_slots",
      description: "Lista horários livres. date=YYYY-MM-DD; period=manha|tarde.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string" },
          period: { type: "string", enum: ["manha", "tarde"] },
          durationMin: { type: "number" },
          limit: { type: "number" },
        },
        required: ["date"],
      },
    },
  },
  book_appointment: {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Agenda horário. Só com clientId, staffId, date e hour confirmados.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          staffId: { type: "string" },
          serviceId: { type: "string" },
          date: { type: "string" },
          hour: { type: "number" },
          durationMin: { type: "number" },
          priceCents: { type: "number" },
        },
        required: ["clientId", "staffId", "date", "hour"],
      },
    },
  },
  cancel_appointment: {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancela agendamento pelo id.",
      parameters: {
        type: "object",
        properties: { appointmentId: { type: "string" } },
        required: ["appointmentId"],
      },
    },
  },
  handoff_human: {
    type: "function",
    function: {
      name: "handoff_human",
      description: "Transfere para atendimento humano no painel.",
      parameters: { type: "object", properties: {} },
    },
  },
  get_unit_context: {
    type: "function",
    function: {
      name: "get_unit_context",
      description:
        "Dados da loja: endereço, horários, diferenciais, redes, branding e profissionais bookable. Use para perguntas de onde fica / que horas abre / sobre a barbearia.",
      parameters: { type: "object", properties: {} },
    },
  },
  open_order: {
    type: "function",
    function: {
      name: "open_order",
      description: "Abre comanda (scaffold).",
      parameters: { type: "object", properties: { clientId: { type: "string" } } },
    },
  },
  add_order_item: {
    type: "function",
    function: {
      name: "add_order_item",
      description: "Adiciona item na comanda (scaffold).",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string" }, serviceId: { type: "string" } },
      },
    },
  },
  list_followups: {
    type: "function",
    function: {
      name: "list_followups",
      description: "Lista clientes para follow-up de retorno.",
      parameters: { type: "object", properties: {} },
    },
  },
  send_whatsapp: {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Envia WhatsApp (uso interno / follow-up).",
      parameters: {
        type: "object",
        properties: { phoneE164: { type: "string" }, text: { type: "string" } },
        required: ["phoneE164", "text"],
      },
    },
  },
};

export function listEnabledSkills(toolsEnabled?: string[] | null) {
  if (!toolsEnabled?.length) return SKILL_CATALOG;
  const enabled = new Set(toolsEnabled);
  return SKILL_CATALOG.filter((s) => s.tools.some((t) => enabled.has(t)));
}

/** Tools LLM derivadas das skills ativas ∩ toolsEnabled. */
export function buildToolsForSkills(input: {
  skills: AgentSkillName[];
  toolsEnabled?: string[] | null;
}): ChatToolDef[] {
  const enabled = new Set(input.toolsEnabled?.length ? input.toolsEnabled : TOOL_CATALOG.map((t) => t.name));
  const names = new Set<AgentToolName>();
  for (const skillName of input.skills) {
    const skill = SKILL_CATALOG.find((s) => s.name === skillName);
    if (!skill) continue;
    for (const t of skill.tools) {
      if (enabled.has(t) && TOOL_SCHEMAS[t]) names.add(t);
    }
  }
  if (enabled.has("get_unit_context")) names.add("get_unit_context");
  if (enabled.has("cancel_appointment")) names.add("cancel_appointment");
  if (enabled.has("list_client_appointments")) names.add("list_client_appointments");
  // Perfis antigos podem não ter list_products no toolsEnabled — libera junto com catálogo.
  if (TOOL_SCHEMAS.list_products && (!input.toolsEnabled?.length || enabled.has("list_services") || enabled.has("list_products"))) {
    names.add("list_products");
  }

  return [...names].map((n) => TOOL_SCHEMAS[n]);
}

export function compileSkillsBlock(skills: AgentSkillName[]): string {
  return [
    "SKILLS DISPONÍVEIS (playbooks — use as tools de cada skill para munir a resposta):",
    ...skills.map((name) => SKILL_PLAYBOOKS[name] || `- ${name}`),
  ].join("\n\n");
}

export function skillsUsedFromTools(toolNames: AgentToolName[]): AgentSkillName[] {
  const used = new Set<AgentSkillName>();
  for (const tool of toolNames) {
    const def = TOOL_CATALOG.find((t) => t.name === tool);
    if (!def) continue;
    for (const s of def.skills) used.add(s);
  }
  return [...used];
}
