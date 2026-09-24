/** Regras da casa — defaults Ragnarok (podem virar config depois). */
export const HOUSE_RULES = {
  /** Minutos após o horário sem atendimento → alerta equipe */
  waitingAlertMin: 5,
  /** Minutos sem check-in → “você vem?” (antes da remarcação) */
  voceVemAfterMin: 10,
  /** Janela típica de almoço (grade cinza / slots livres — encaixe do painel ignora) */
  lunchStartHm: "12:00",
  lunchEndHm: "14:00",
  /** Sábado: ao encaixar, avisar (não bloqueia) */
  saturdayEncaixeWarn: true,
  /** Profissionais com carteira fechada (só deles ou quem pediu) */
  lockedStaffNames: ["luciano", "diogo"],
  /** Recorrência fechada sem remarcar */
  recurrenceLapseDays: 10,
  /** Cliente “semanal” sem próximo horário */
  weeklyClientLookbackDays: 21,
  weeklyClientMinVisits: 2,
} as const;

export function isLockedStaffName(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return HOUSE_RULES.lockedStaffNames.some((k) => n.includes(k));
}

export function isLunchTimeHm(hm: string): boolean {
  return hm >= HOUSE_RULES.lunchStartHm && hm < HOUSE_RULES.lunchEndHm;
}
