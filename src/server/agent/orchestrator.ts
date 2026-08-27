import { and, count, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { resolveDateFromHint, type FreeSlot } from "./domain-agenda";
import {
  craftPastServiceOffer,
  humanizeReply,
  pickOfferFromHistory,
  type HumanizeFacts,
} from "./humanize";
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

function detectPeriod(text: string): "manha" | "tarde" | null {
  if (/manh[aã]|de manh|pela manh|antes do meio/.test(text)) return "manha";
  if (/tarde|de tarde|pela tarde|depois do almo/.test(text)) return "tarde";
  return null;
}

function detectServiceHint(text: string): string | null {
  if (/combo|corte\s*\+?\s*barba|corte\s*e\s*barba/.test(text)) return "combo";
  if (/s[oó]\s+corte|apenas corte|corte simples/.test(text)) return "corte";
  if (/barba/.test(text) && !/corte/.test(text)) return "barba";
  if (/corte|cabelo|degrad[eê]/.test(text)) return "corte";
  if (/sobrancelha/.test(text)) return "sobrancelha";
  if (/repetir|mesmo|de sempre|como da última|como da ultima/.test(text)) return "repeat";
  return null;
}

function isComboName(name: string) {
  return /combo|corte\s*\+?\s*barba|barba\s*\+?\s*corte|corte\s*e\s*barba/i.test(name);
}

type ServiceRow = { id?: string; name: string; durationMin: number; priceCents: number };

function pickRelevantService(
  services: ServiceRow[],
  hint: string | null,
  prefersCombo: boolean,
  offerPast?: string | null
): ServiceRow | null {
  if (!services.length) return null;

  if (hint === "repeat" && offerPast) {
    const match = services.find((s) => s.name.toLowerCase() === offerPast.toLowerCase());
    if (match) return match;
    const soft = services.find((s) =>
      offerPast.toLowerCase().split(/\s|\+/).some((p) => p.length > 3 && s.name.toLowerCase().includes(p))
    );
    if (soft) return soft;
  }

  const want = prefersCombo && !hint ? "combo" : hint;
  if (want === "combo") {
    return services.find((s) => isComboName(s.name)) ?? services[0];
  }
  if (want === "barba") {
    return services.find((s) => /barba/i.test(s.name) && !isComboName(s.name)) ?? services[0];
  }
  if (want === "sobrancelha") {
    return services.find((s) => /sobrancelha/i.test(s.name)) ?? services[0];
  }
  if (want === "corte") {
    return (
      services.find((s) => /corte/i.test(s.name) && !isComboName(s.name) && !/barba/i.test(s.name)) ??
      services.find((s) => /corte/i.test(s.name)) ??
      services[0]
    );
  }
  return null;
}

type BookingDraft = {
  dayLabel?: string;
  date?: string;
  period?: "manha" | "tarde";
  serviceId?: string;
  serviceName?: string;
  durationMin?: number;
  priceCents?: number;
  clientId?: string;
  offered?: FreeSlot[];
};

type ClientCtx = {
  found: boolean;
  clientId?: string;
  firstName?: string;
  prefersCombo?: boolean;
  lastServiceName?: string | null;
  pastServices?: string[];
};

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

async function loadBookingDraft(conversationId: string): Promise<BookingDraft> {
  const db = createDb();
  const [row] = await db
    .select({ meta: schema.conversations.meta })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  const draft = row?.meta?.booking;
  if (!draft || typeof draft !== "object") return {};
  return draft as BookingDraft;
}

async function saveBookingDraft(conversationId: string, draft: BookingDraft | null) {
  const db = createDb();
  const [row] = await db
    .select({ meta: schema.conversations.meta })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  const meta = { ...(row?.meta ?? {}) };
  if (draft && Object.keys(draft).length) meta.booking = draft;
  else delete meta.booking;
  await db
    .update(schema.conversations)
    .set({ meta, updatedAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
}

function detectHourChoice(text: string, offered: FreeSlot[]): FreeSlot | null {
  if (!offered.length) return null;
  if (/primeiro|1[oº]?|fechou|confirma(do)?|pode ser esse|esse mesmo/.test(text)) {
    return offered[0];
  }
  if (/segundo|2[oº]?/.test(text) && offered[1]) return offered[1];
  if (/terceiro|3[oº]?/.test(text) && offered[2]) return offered[2];

  const m =
    text.match(/\b([01]?\d|2[0-3])\s*[h:]\s*([0-5]\d)?\b/) ||
    text.match(/\b([01]?\d|2[0-3])\s*horas?\b/);
  if (m) {
    const hour = Number(m[1]);
    return offered.find((s) => s.hour === hour) ?? null;
  }
  return null;
}

function formatSlotLine(s: FreeSlot) {
  return `${s.label} com ${s.staffName}`;
}

/**
 * Orquestrador: decide fatos/tools; humanizeReply dá o tom (LLM se houver key).
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

  async function finish(
    draftReply: string,
    skills: AgentSkillName[],
    facts: Omit<HumanizeFacts, "userText" | "draftReply"> & { intent: HumanizeFacts["intent"] },
    extra?: { handoff?: boolean }
  ): Promise<OrchestratorResult> {
    const reply = await humanizeReply({
      persona,
      displayName,
      systemPrompt: profile?.systemPrompt,
      model: profile?.model,
      temperature: profile?.temperature,
      facts: {
        userText: input.userText,
        draftReply,
        ...facts,
      },
    });
    return {
      reply,
      skills,
      toolCalls,
      handoff: extra?.handoff,
    };
  }

  const text = input.userText.toLowerCase();
  const skills: AgentSkillName[] = [];
  if (/agend|marcar|hor[aá]rio|reserv|tem vaga|dispon|manh[aã]|tarde|repetir/.test(text)) {
    skills.push("skill.schedule");
  }
  if (/comanda|servi[cç]o|cortar|barba|corte|combo|sobrancelha/.test(text)) {
    if (!skills.includes("skill.schedule")) skills.push("skill.schedule");
    skills.push("skill.order");
  }
  if (/voltar|sumiu|faz tempo|saudade/.test(text)) skills.push("skill.followup");
  if (/atendente|humano|pessoa|recep[cç]/.test(text)) skills.push("skill.handoff");

  if (skills.includes("skill.handoff") && enabled.some((t) => t.name === "handoff_human")) {
    const r = await executeTool("handoff_human", toolCtx);
    toolCalls.push({ name: "handoff_human", ok: r.ok });
    await saveBookingDraft(input.conversationId, null);
    return finish(
      r.ok
        ? `Claro — já chamei alguém da equipe. Em instantes alguém assume por aqui.`
        : `Não consegui transferir agora. Tenta de novo em instantes?`,
      skills,
      { intent: "handoff" },
      { handoff: r.ok }
    );
  }

  const priorAi = await countPriorAiReplies(input.conversationId);
  const isFirstReply = priorAi === 0;
  const greeting = persona
    ? pickGreeting(persona, displayName)
    : `Olá! Sou ${displayName}.`;

  let clientCtx: ClientCtx = { found: false };
  if (enabled.some((t) => t.name === "find_client")) {
    const r = await executeTool("find_client", toolCtx, { phoneE164: input.phoneE164 });
    toolCalls.push({ name: "find_client", ok: r.ok });
    if (r.ok && r.data?.found) {
      const c = r.data.client as { id?: string; firstName?: string } | undefined;
      const past = Array.isArray(r.data.recentServices)
        ? (r.data.recentServices as string[]).filter(Boolean)
        : [];
      clientCtx = {
        found: true,
        clientId: c?.id,
        firstName: c?.firstName,
        prefersCombo: Boolean(r.data.prefersCombo),
        lastServiceName: (r.data.lastServiceName as string | null | undefined) ?? null,
        pastServices: past,
      };
    }
  }

  const offerPast = pickOfferFromHistory({
    lastServiceName: clientCtx.lastServiceName,
    pastServices: clientCtx.pastServices,
    preferCombo: clientCtx.prefersCombo,
  });

  const draft = await loadBookingDraft(input.conversationId);
  const dayHint = detectDayHint(text) ?? draft.dayLabel ?? null;
  const period = detectPeriod(text) ?? draft.period ?? null;
  let serviceHint = detectServiceHint(text);
  if (serviceHint === "repeat" || (/repetir|mesmo|de sempre/.test(text) && offerPast)) {
    serviceHint = serviceHint || "repeat";
  }

  const wantsSchedule =
    skills.includes("skill.schedule") ||
    Boolean(dayHint) ||
    Boolean(serviceHint) ||
    Boolean(draft.date) ||
    Boolean(draft.offered?.length);

  const hi = clientCtx.firstName
    ? `Oi, ${clientCtx.firstName}!`
    : isFirstReply
      ? greeting.replace(/\s*Como posso te ajudar hoje\??\s*$/i, "").trim()
      : "Oi!";

  const baseFacts = {
    firstName: clientCtx.firstName,
    pastServices: clientCtx.pastServices,
    lastServiceName: clientCtx.lastServiceName,
    offerPastService: offerPast,
  };

  if (wantsSchedule) {
    let services: ServiceRow[] = [];
    if (enabled.some((t) => t.name === "list_services")) {
      const r = await executeTool("list_services", toolCtx);
      toolCalls.push({ name: "list_services", ok: r.ok });
      services = Array.isArray(r.data?.services) ? (r.data.services as ServiceRow[]) : [];
    }

    const picked =
      (draft.serviceId ? services.find((s) => s.id === draft.serviceId) : null) ||
      pickRelevantService(
        services,
        serviceHint,
        Boolean(clientCtx.prefersCombo),
        offerPast
      );

    const nextDraft: BookingDraft = {
      ...draft,
      dayLabel: dayHint ?? draft.dayLabel,
      date: resolveDateFromHint(dayHint) ?? draft.date,
      period: period ?? draft.period,
      clientId: clientCtx.clientId ?? draft.clientId,
    };

    if (picked) {
      nextDraft.serviceId = picked.id;
      nextDraft.serviceName = picked.name;
      nextDraft.durationMin = picked.durationMin;
      nextDraft.priceCents = picked.priceCents;
    } else if (serviceHint === "corte") {
      nextDraft.serviceName = "Corte";
      nextDraft.durationMin = 30;
    } else if (clientCtx.prefersCombo || serviceHint === "combo" || serviceHint === "repeat") {
      nextDraft.serviceName = offerPast || "Corte+Barba";
      nextDraft.durationMin = 45;
    }

    if (!nextDraft.clientId) {
      const db = createDb();
      const [existing] = await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(
          and(
            eq(schema.clients.tenantId, input.tenantId),
            eq(schema.clients.phoneE164, input.phoneE164)
          )
        )
        .limit(1);
      if (existing) {
        nextDraft.clientId = existing.id;
      } else {
        const [created] = await db
          .insert(schema.clients)
          .values({
            tenantId: input.tenantId,
            name: clientCtx.firstName || "Cliente WhatsApp",
            phoneE164: input.phoneE164,
            phone: input.phoneE164,
            isActive: true,
          })
          .returning({ id: schema.clients.id });
        nextDraft.clientId = created?.id;
      }
      if (nextDraft.clientId) {
        await db
          .update(schema.conversations)
          .set({ clientId: nextDraft.clientId, updatedAt: new Date() })
          .where(eq(schema.conversations.id, input.conversationId));
      }
    }

    const offered = draft.offered ?? [];
    const choice = detectHourChoice(text, offered);
    if (choice && nextDraft.clientId && enabled.some((t) => t.name === "book_appointment")) {
      const booked = await executeTool("book_appointment", toolCtx, {
        clientId: nextDraft.clientId,
        staffId: choice.staffId,
        serviceId: nextDraft.serviceId,
        date: choice.date,
        hour: choice.hour,
        durationMin: nextDraft.durationMin ?? 30,
        priceCents: nextDraft.priceCents,
      });
      toolCalls.push({ name: "book_appointment", ok: booked.ok });
      await saveBookingDraft(input.conversationId, null);
      if (!booked.ok) {
        return finish(
          `${hi} Esse horário acabou de sair. Quer que eu veja outras opções na ${nextDraft.period === "tarde" ? "tarde" : "manhã"}?`,
          ["skill.schedule"],
          { ...baseFacts, intent: "ask_details", dayLabel: nextDraft.dayLabel, period: nextDraft.period }
        );
      }
      const svc = nextDraft.serviceName ?? "serviço";
      return finish(
        `${hi} Fechado: ${svc} no ${nextDraft.dayLabel ?? "dia"} às ${choice.label} com ${choice.staffName}. Te esperamos na loja!`,
        ["skill.schedule"],
        {
          ...baseFacts,
          intent: "booked",
          serviceName: svc,
          dayLabel: nextDraft.dayLabel,
          booked: {
            service: svc,
            when: `${nextDraft.dayLabel ?? choice.date} às ${choice.label}`,
            staff: choice.staffName,
          },
        }
      );
    }

    const canOfferSlots =
      nextDraft.date &&
      nextDraft.period &&
      (nextDraft.serviceName || nextDraft.serviceId) &&
      enabled.some((t) => t.name === "list_slots");

    if (canOfferSlots) {
      const slotsRes = await executeTool("list_slots", toolCtx, {
        date: nextDraft.date,
        period: nextDraft.period,
        durationMin: nextDraft.durationMin ?? 30,
        limit: 4,
      });
      toolCalls.push({ name: "list_slots", ok: slotsRes.ok });
      const slots = Array.isArray(slotsRes.data?.slots)
        ? (slotsRes.data.slots as FreeSlot[])
        : [];
      if (!slots.length) {
        await saveBookingDraft(input.conversationId, nextDraft);
        return finish(
          `${hi} Nessa ${nextDraft.period === "tarde" ? "tarde" : "manhã"} do ${nextDraft.dayLabel ?? "dia"} não achei vaga. Quer que eu olhe o outro período?`,
          ["skill.schedule"],
          {
            ...baseFacts,
            intent: "ask_details",
            dayLabel: nextDraft.dayLabel,
            period: nextDraft.period,
            serviceName: nextDraft.serviceName,
          }
        );
      }
      nextDraft.offered = slots;
      await saveBookingDraft(input.conversationId, nextDraft);
      const lines = slots.slice(0, 3).map((s, i) => `${i + 1}) ${formatSlotLine(s)}`);
      const svc = nextDraft.serviceName ?? "serviço";
      const price =
        typeof nextDraft.priceCents === "number"
          ? ` (${formatMoneyBRL(nextDraft.priceCents)})`
          : "";
      return finish(
        `${hi} Pro ${nextDraft.dayLabel ?? "dia"} tenho estes horários de ${svc}${price}:\n${lines.join("\n")}\nQual prefere?`,
        ["skill.schedule"],
        {
          ...baseFacts,
          intent: "offer_slots",
          dayLabel: nextDraft.dayLabel,
          period: nextDraft.period,
          serviceName: svc,
          slots: lines,
        }
      );
    }

    await saveBookingDraft(input.conversationId, nextDraft);

    // Sem serviço explícito → oferece o que já fez (humanizado)
    if (!nextDraft.serviceName && !serviceHint && offerPast) {
      return finish(
        craftPastServiceOffer({
          firstName: clientCtx.firstName,
          offerService: offerPast,
          dayLabel: dayHint,
          askingSchedule: true,
        }),
        ["skill.schedule"],
        {
          ...baseFacts,
          intent: "ask_details",
          dayLabel: dayHint,
          offerPastService: offerPast,
        }
      );
    }

    if (!nextDraft.serviceName && !serviceHint) {
      return finish(
        `${hi}${dayHint ? ` Pro ${dayHint},` : ""} me diz o serviço (corte, combo, barba…) e se prefere manhã ou tarde.`,
        ["skill.schedule"],
        { ...baseFacts, intent: "ask_details", dayLabel: dayHint }
      );
    }

    if (!nextDraft.period) {
      const svcBit = nextDraft.serviceName ? ` — ${nextDraft.serviceName}` : "";
      return finish(
        `${hi} Perfeito${svcBit}${dayHint ? ` no ${dayHint}` : ""}. Você prefere manhã ou tarde?`,
        ["skill.schedule"],
        {
          ...baseFacts,
          intent: "ask_details",
          dayLabel: dayHint,
          serviceName: nextDraft.serviceName,
        }
      );
    }

    if (!nextDraft.date) {
      return finish(
        `${hi} Me confirma o dia (hoje, amanhã ou o dia da semana) que eu olho a agenda.`,
        ["skill.schedule"],
        { ...baseFacts, intent: "ask_details", serviceName: nextDraft.serviceName }
      );
    }
  }

  // Saudação / genérico com reoferta de histórico
  if (clientCtx.found && offerPast && (isFirstReply || /oi|ol[aá]|bom dia|boa tarde|boa noite/.test(text))) {
    return finish(
      craftPastServiceOffer({
        firstName: clientCtx.firstName,
        offerService: offerPast,
        askingSchedule: false,
      }),
      skills,
      { ...baseFacts, intent: "greet", offerPastService: offerPast }
    );
  }

  if (clientCtx.found && clientCtx.firstName) {
    return finish(
      `Oi, ${clientCtx.firstName}! Em que posso te ajudar — agendar, dúvida de serviço ou falar com a recepção?`,
      skills,
      { ...baseFacts, intent: "greet" }
    );
  }

  if (/oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|opa/.test(text) || isFirstReply) {
    return finish(
      `${greeting} Posso te ajudar a agendar, tirar dúvida ou chamar a recepção. O que você precisa?`.trim(),
      skills,
      { intent: "greet" }
    );
  }

  return finish(
    "Posso agendar um horário, falar de serviços ou chamar alguém da equipe — o que prefere?",
    skills,
    { ...baseFacts, intent: "generic" }
  );
}
