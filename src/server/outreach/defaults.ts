export type OutreachSettingsView = {
  confirmationEnabled: boolean;
  followup30Enabled: boolean;
  followup60Enabled: boolean;
  sundayBlastEnabled: boolean;
  emptyAgendaEnabled: boolean;
  soundOnConfirmEnabled: boolean;
  birthdayEnabled: boolean;
  birthdayDiscountPct: number;
  confirmationSendTime: string;
  skipSundays: boolean;
  skipHolidays: boolean;
  customClosedDates: string[];
  followupMonthDays: number[];
  followup30Days: number;
  followup60Days: number;
  blastActiveWithinDays: number;
  /** Teto de envios reais/dry-run por dia (tenant). */
  dailyCap: number;
  /** Simula fila sem WhatsApp (Evolution). */
  dryRunEnabled: boolean;
  templateConfirmation: string;
  templateFollowup30: string;
  templateFollowup60: string;
  templateSundayBlast: string;
  templateEmptyAgenda: string;
  templateBirthday: string;
  /** Variantes extras (além do template principal) — anti-fingerprint. */
  templateConfirmationVariants: string[];
  templateFollowup30Variants: string[];
  templateFollowup60Variants: string[];
  templateSundayBlastVariants: string[];
  templateEmptyAgendaVariants: string[];
  templateBirthdayVariants: string[];
};

/** Pools default — tom humano curto, sem “bot”. */
export const DEFAULT_OUTREACH_VARIANT_POOLS = {
  confirmation: [
    "Oi {{nome}}! Aqui é da {{barbearia}}. Confirmando seu horário amanhã ({{data}}) às {{hora}} com {{profissional}}. Responde OK pra confirmar 🙂",
    "{{nome}}, tudo bem? Passando pra confirmar amanhã {{data}} às {{hora}} com {{profissional}} na {{barbearia}}. Pode responder OK?",
    "Oi {{nome}}! Seu horário na {{barbearia}} amanhã ({{data}}) {{hora}} — {{profissional}}. Confirma com um OK pra gente?",
    "Fala {{nome}}! Confirmando: amanhã {{data}} às {{hora}} com {{profissional}} ({{barbearia}}). Responde OK se estiver de boa.",
  ],
  followup30: [
    "Oi {{nome}}! Faz um tempo que você não aparece na {{barbearia}}. Quer que a gente reserve um horário pra você?",
    "{{nome}}, sentimos sua falta por aqui na {{barbearia}}. Quer marcar um horário?",
    "Oi {{nome}}! Já faz umas semanas sem te ver na {{barbearia}}. Se quiser, a gente encaixa um horário.",
  ],
  followup60: [
    "Oi {{nome}}! Sentimos sua falta na {{barbearia}}. Que tal marcar um horário e renovar o visual?",
    "{{nome}}, faz um tempão que você não vem na {{barbearia}}. Quer que eu veja horário pra você?",
    "Oi {{nome}}! A {{barbearia}} tá com saudade. Responde aqui se quiser agendar.",
  ],
  sundayBlast: [
    "Oi {{nome}}! Bom domingo da {{barbearia}}. Se quiser encaixar na semana, é só responder aqui que a gente vê horário.",
    "{{nome}}, bom domingo! Na {{barbearia}} a gente encaixa sua semana — responde se quiser horário.",
  ],
  emptyAgenda: [
    "Oi {{nome}}! O {{profissional}} tem horários livres amanhã na {{barbearia}}. Quer que eu te encaixe?",
    "{{nome}}, o {{profissional}} tá com agenda aberta amanhã ({{data}}) na {{barbearia}}. Te encaixo?",
    "Oi {{nome}}! Sobrou horário com {{profissional}} amanhã na {{barbearia}}. Quer um?",
  ],
  birthday: [
    "Oi {{nome}}! Feliz aniversário da {{barbearia}}! 🎉 Tem {{desconto}}% de desconto pra você usar esta semana. Quer agendar?",
    "{{nome}}, parabéns! 🎂 A {{barbearia}} te dá {{desconto}}% esta semana. Quer marcar horário?",
    "Feliz aniversário, {{nome}}! Na {{barbearia}} tem {{desconto}}% pra você. Responde se quiser agendar.",
  ],
} as const;

export const DEFAULT_OUTREACH_TEMPLATES = {
  confirmation: DEFAULT_OUTREACH_VARIANT_POOLS.confirmation[0],
  followup30: DEFAULT_OUTREACH_VARIANT_POOLS.followup30[0],
  followup60: DEFAULT_OUTREACH_VARIANT_POOLS.followup60[0],
  sundayBlast: DEFAULT_OUTREACH_VARIANT_POOLS.sundayBlast[0],
  emptyAgenda: DEFAULT_OUTREACH_VARIANT_POOLS.emptyAgenda[0],
  birthday: DEFAULT_OUTREACH_VARIANT_POOLS.birthday[0],
} as const;

export function defaultOutreachSettings(): OutreachSettingsView {
  return {
    confirmationEnabled: false,
    followup30Enabled: false,
    followup60Enabled: false,
    sundayBlastEnabled: false,
    emptyAgendaEnabled: false,
    soundOnConfirmEnabled: false,
    birthdayEnabled: false,
    birthdayDiscountPct: 10,
    confirmationSendTime: "18:00",
    skipSundays: true,
    skipHolidays: true,
    customClosedDates: [],
    followupMonthDays: [5, 6, 10, 11, 20, 21],
    followup30Days: 30,
    followup60Days: 60,
    blastActiveWithinDays: 120,
    dailyCap: 100,
    dryRunEnabled: true,
    templateConfirmation: DEFAULT_OUTREACH_TEMPLATES.confirmation,
    templateFollowup30: DEFAULT_OUTREACH_TEMPLATES.followup30,
    templateFollowup60: DEFAULT_OUTREACH_TEMPLATES.followup60,
    templateSundayBlast: DEFAULT_OUTREACH_TEMPLATES.sundayBlast,
    templateEmptyAgenda: DEFAULT_OUTREACH_TEMPLATES.emptyAgenda,
    templateBirthday: DEFAULT_OUTREACH_TEMPLATES.birthday,
    templateConfirmationVariants: [...DEFAULT_OUTREACH_VARIANT_POOLS.confirmation.slice(1)],
    templateFollowup30Variants: [...DEFAULT_OUTREACH_VARIANT_POOLS.followup30.slice(1)],
    templateFollowup60Variants: [...DEFAULT_OUTREACH_VARIANT_POOLS.followup60.slice(1)],
    templateSundayBlastVariants: [...DEFAULT_OUTREACH_VARIANT_POOLS.sundayBlast.slice(1)],
    templateEmptyAgendaVariants: [...DEFAULT_OUTREACH_VARIANT_POOLS.emptyAgenda.slice(1)],
    templateBirthdayVariants: [...DEFAULT_OUTREACH_VARIANT_POOLS.birthday.slice(1)],
  };
}

export type OutreachKind =
  | "confirmation_daily"
  | "followup_inactive"
  | "sunday_blast"
  | "empty_agenda"
  | "voce_vem"
  | "delay_reschedule"
  | "birthday"
  | "manual"
  | "campaign";

/** Kinds operacionais — não entram no teto 1/telefone/24h. */
export const OUTREACH_OPERATIONAL_KINDS: OutreachKind[] = [
  "voce_vem",
  "delay_reschedule",
];
