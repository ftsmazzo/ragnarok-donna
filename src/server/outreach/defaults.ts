export type OutreachSettingsView = {
  confirmationEnabled: boolean;
  followup30Enabled: boolean;
  followup60Enabled: boolean;
  sundayBlastEnabled: boolean;
  emptyAgendaEnabled: boolean;
  soundOnConfirmEnabled: boolean;
  confirmationSendTime: string;
  skipSundays: boolean;
  skipHolidays: boolean;
  customClosedDates: string[];
  followupMonthDays: number[];
  followup30Days: number;
  followup60Days: number;
  blastActiveWithinDays: number;
  templateConfirmation: string;
  templateFollowup30: string;
  templateFollowup60: string;
  templateSundayBlast: string;
  templateEmptyAgenda: string;
};

export const DEFAULT_OUTREACH_TEMPLATES = {
  confirmation:
    "Oi {{nome}}! Aqui é da {{barbearia}}. Confirmando seu horário amanhã ({{data}}) às {{hora}} com {{profissional}}. Responde OK pra confirmar 🙂",
  followup30:
    "Oi {{nome}}! Faz um tempo que você não aparece na {{barbearia}}. Quer que a gente reserve um horário pra você?",
  followup60:
    "Oi {{nome}}! Sentimos sua falta na {{barbearia}}. Que tal marcar um horário e renovar o visual?",
  sundayBlast:
    "Oi {{nome}}! Bom domingo da {{barbearia}}. Se quiser encaixar na semana, é só responder aqui que a gente vê horário.",
  emptyAgenda:
    "Oi {{nome}}! O {{profissional}} tem horários livres amanhã na {{barbearia}}. Quer que eu te encaixe?",
} as const;

export function defaultOutreachSettings(): OutreachSettingsView {
  return {
    confirmationEnabled: false,
    followup30Enabled: false,
    followup60Enabled: false,
    sundayBlastEnabled: false,
    emptyAgendaEnabled: false,
    soundOnConfirmEnabled: false,
    confirmationSendTime: "18:00",
    skipSundays: true,
    skipHolidays: true,
    customClosedDates: [],
    followupMonthDays: [5, 6, 10, 11, 20, 21],
    followup30Days: 30,
    followup60Days: 60,
    blastActiveWithinDays: 120,
    templateConfirmation: DEFAULT_OUTREACH_TEMPLATES.confirmation,
    templateFollowup30: DEFAULT_OUTREACH_TEMPLATES.followup30,
    templateFollowup60: DEFAULT_OUTREACH_TEMPLATES.followup60,
    templateSundayBlast: DEFAULT_OUTREACH_TEMPLATES.sundayBlast,
    templateEmptyAgenda: DEFAULT_OUTREACH_TEMPLATES.emptyAgenda,
  };
}

export type OutreachKind =
  | "confirmation_daily"
  | "followup_inactive"
  | "sunday_blast"
  | "empty_agenda"
  | "voce_vem"
  | "delay_reschedule"
  | "manual"
  | "campaign";
