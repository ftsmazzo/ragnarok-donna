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
5. Datas: SEMPRE resolve_date com a frase do cliente ("próxima segunda", "amanhã", "1/9", "quarta que vem") ANTES de list_slots/book. Use o date + label retornados — NUNCA invente weekday. Se mismatchWeekday=true, diga o dia correto.
6. Marcar → list_services → resolve_date → list_slots (passe preferredHour se pediu hora, ex.: 17; datePhrase opcional) → confirme com label da tool → book_appointment.
7. LISTA DE ESPERA (OBRIGATÓRIO quando o horário pedido NÃO está livre):
   - Na MESMA mensagem em que avisa que o horário está ocupado e oferece alternativas, SEMPRE pergunte também se quer entrar na lista de espera daquele horário (ex.: "às 17h").
   - Frase modelo: "O Diego não tem 17h livre. Posso te encaixar às 13h, 14h ou 15h — ou te coloco na lista de espera pra 17h e te aviso se liberar. O que prefere?"
   - NÃO feche só com alternativas. A espera tem que ser oferecida junto.
   - Se o cliente aceitar espera (ou disser "pode colocar na espera" / "me avisa se liberar"):
     → add_to_waitlist com clientId/phone, staffId, serviceId, desiredDate=YYYY-MM-DD, notes="horário desejado HH:00".
     → Confirme: "Pronto, você está na espera. Se liberar, te chamo no Zap."
8. Cancelar → list_client_appointments → cancel_appointment com o id.
9. Endereço / horário / sobre a loja → get_unit_context.
Nunca invente horário nem dia da semana.`,

  "skill.order": `SKILL.ORDER — produtos e comanda
Quando o cliente pergunta sobre produto à venda (balm, pomada, shampoo, óleo, kit…):
→ list_products com query (ex.: "balm", "barba"). Responda com nome + priceLabel.
Se count=0, diga que não encontrou no estoque de venda e ofereça chamar a equipe — não invente.
Recepcão / operação (comandas abertas, valor de comanda, telefone do cliente):
→ list_open_orders (sem filtro = todas abertas; com phoneE164/clientId = daquele cliente). Use totalOpenLabel e totalLabel.
Para abrir/lancar: find_client → open_order → add_order_item (itemType service|product + catalogId).`,

  "skill.followup": `SKILL.FOLLOWUP — retorno
Quando for convite de retorno / cliente sumido:
list_followups / find_client. Para enviar mensagem use send_whatsapp com phoneE164 e texto curto.
Não force oferta se o cliente pediu outra coisa.`,

  "skill.handoff": `SKILL.HANDOFF — humano
Se pedirem recepção/gerente/humano, ou se você travar:
chame handoff_human e avise que a equipe vai assumir.
Perguntas de operação da recepção (comandas abertas, espera) → list_open_orders / list_waitlist.`,
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
  resolve_date: {
    type: "function",
    function: {
      name: "resolve_date",
      description:
        "OBRIGATÓRIO para qualquer data relativa ou DD/MM. Converte frase (ex.: 'próxima segunda', 'amanhã', '1/9', 'quarta que vem') em date YYYY-MM-DD + weekday real (America/Sao_Paulo). Use o label retornado ao falar com o cliente.",
      parameters: {
        type: "object",
        properties: {
          phrase: {
            type: "string",
            description: "Trecho temporal do cliente (ex.: próxima segunda, amanhã, dia 1/9)",
          },
        },
        required: ["phrase"],
      },
    },
  },
  list_slots: {
    type: "function",
    function: {
      name: "list_slots",
      description:
        "Lista horários livres. Prefira date=YYYY-MM-DD vindo de resolve_date. datePhrase resolve no servidor se date faltar. preferredHour detecta ocupação/espera. Resposta inclui dateLabel (weekday real).",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD (de resolve_date)" },
          datePhrase: {
            type: "string",
            description: "Frase temporal se ainda não tiver date (ex.: próxima segunda)",
          },
          period: { type: "string", enum: ["manha", "tarde"] },
          durationMin: { type: "number" },
          preferredHour: {
            type: "number",
            description: "Hora que o cliente pediu (ex.: 17). Usado para detectar ocupação e sugerir espera.",
          },
          staffId: { type: "string", description: "Filtrar profissional (ex.: Diego)" },
          limit: { type: "number" },
        },
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
      description: "Abre comanda para o cliente (reusa se já houver aberta).",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          appointmentId: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
  add_order_item: {
    type: "function",
    function: {
      name: "add_order_item",
      description: "Adiciona serviço ou produto na comanda aberta. Baixa estoque de produto.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          itemType: { type: "string", enum: ["service", "product"] },
          catalogId: { type: "string", description: "ID do serviço ou produto" },
          serviceId: { type: "string", description: "Alias de catalogId para serviço" },
          productId: { type: "string", description: "Alias de catalogId para produto" },
          staffId: { type: "string" },
          qty: { type: "number" },
        },
        required: ["orderId"],
      },
    },
  },
  list_open_orders: {
    type: "function",
    function: {
      name: "list_open_orders",
      description:
        "Lista comandas abertas com valor. Sem filtro = todas. Com phoneE164 ou clientId = daquele cliente. Use para 'quantas comandas abertas' / 'valor da comanda do telefone X'.",
      parameters: {
        type: "object",
        properties: {
          phoneE164: { type: "string" },
          clientId: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  add_to_waitlist: {
    type: "function",
    function: {
      name: "add_to_waitlist",
      description:
        "Coloca o cliente na lista de espera do horário desejado. Chame quando o cliente aceitar esperar (ou pedir para avisar se liberar). desiredDate=YYYY-MM-DD; notes deve incluir a hora (ex.: 'deseja 17:00 com Diego').",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          phone: { type: "string" },
          staffId: { type: "string" },
          serviceId: { type: "string" },
          desiredDate: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string" },
        },
      },
    },
  },
  list_waitlist: {
    type: "function",
    function: {
      name: "list_waitlist",
      description: "Consulta a lista de espera.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["waiting", "notified", "all"] },
          limit: { type: "number" },
        },
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
      description: "Envia WhatsApp via Evolution (follow-up ou aviso).",
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
  // Perfis antigos: libera tools novas de comanda / espera / zap
  for (const t of [
    "open_order",
    "add_order_item",
    "list_open_orders",
    "add_to_waitlist",
    "list_waitlist",
    "send_whatsapp",
    "resolve_date",
  ] as AgentToolName[]) {
    if (TOOL_SCHEMAS[t] && (!input.toolsEnabled?.length || enabled.has("book_appointment") || enabled.has(t))) {
      names.add(t);
    }
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
