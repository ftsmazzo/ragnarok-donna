/** Ritmo de retorno do cliente a partir do histórico de visitas (painel CRM). */

export const CRM_FREQUENCY = [
  { value: "novo", label: "Novo" },
  { value: "recorrente", label: "Recorrente" },
  { value: "janela", label: "Na janela" },
  { value: "risco", label: "Risco" },
  { value: "inativo", label: "Inativo" },
  { value: "reativado", label: "Reativado" },
] as const;

export type CrmFrequency = (typeof CRM_FREQUENCY)[number]["value"];

export const CRM_FREQUENCY_DEFAULTS = {
  /** Abaixo disso com poucas visitas = novo. */
  newMaxVisits: 2,
  newMaxDaysSinceFirst: 45,
  /** Sem visita ≥ N dias = inativo (alinha Perfil). */
  inactiveDays: 60,
  /** Não listar quem sumiu há mais que isto. */
  actionableWindowDays: 100,
  /** Visitou de novo após gap longo = reativado (últimos N dias). */
  reactivatedLookbackDays: 14,
  /** Frações do intervalo médio próprio. */
  windowLow: 0.85,
  windowHigh: 1.15,
  /** Intervalo médio mínimo (dias) para não classificar ruído. */
  minAvgIntervalDays: 14,
  /** Fallback se só 1 visita antiga. */
  defaultIntervalDays: 45,
} as const;

export type CrmVisitStats = {
  visitCount: number;
  firstAt: Date | null;
  lastAt: Date | null;
  /** Intervalo médio entre visitas (dias). */
  avgIntervalDays: number | null;
  /** Houve gap ≥ inactiveDays entre visitas consecutivas. */
  hadLongGap: boolean;
};

export type CrmFrequencyResult = {
  frequency: CrmFrequency;
  daysSince: number | null;
  avgIntervalDays: number | null;
  visitCount: number;
  dueForReturn: boolean;
  label: string;
};

function daysBetween(from: Date, to = new Date()): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function labelCrmFrequency(value: string | null | undefined): string {
  if (!value) return "—";
  return CRM_FREQUENCY.find((o) => o.value === value)?.label ?? value;
}

/**
 * Classifica o ritmo. Pure — fácil de testar sem DB.
 */
export function classifyCrmFrequency(
  stats: CrmVisitStats,
  opts?: Partial<typeof CRM_FREQUENCY_DEFAULTS>
): CrmFrequencyResult {
  const cfg = { ...CRM_FREQUENCY_DEFAULTS, ...opts };
  const visitCount = stats.visitCount;
  const lastAt = stats.lastAt;
  const firstAt = stats.firstAt;
  const daysSince = lastAt ? daysBetween(lastAt) : null;
  const avg =
    stats.avgIntervalDays && stats.avgIntervalDays >= cfg.minAvgIntervalDays
      ? stats.avgIntervalDays
      : visitCount >= 2
        ? cfg.defaultIntervalDays
        : null;

  const base = {
    daysSince,
    avgIntervalDays: avg,
    visitCount,
  };

  if (!lastAt || daysSince == null) {
    return {
      ...base,
      frequency: "novo",
      dueForReturn: false,
      label: labelCrmFrequency("novo"),
    };
  }

  const daysSinceFirst = firstAt ? daysBetween(firstAt) : daysSince;

  // Reativado: voltou recentemente depois de gap longo
  if (
    stats.hadLongGap &&
    daysSince <= cfg.reactivatedLookbackDays &&
    visitCount >= 2
  ) {
    return {
      ...base,
      frequency: "reativado",
      dueForReturn: false,
      label: labelCrmFrequency("reativado"),
    };
  }

  // Novo: poucas visitas e histórico curto
  if (
    visitCount <= cfg.newMaxVisits &&
    daysSinceFirst <= cfg.newMaxDaysSinceFirst
  ) {
    const due =
      daysSince >= (avg ?? cfg.defaultIntervalDays) * cfg.windowLow &&
      daysSince < cfg.inactiveDays;
    return {
      ...base,
      frequency: "novo",
      dueForReturn: due,
      label: labelCrmFrequency("novo"),
    };
  }

  // Fora da janela acionável (sumiu há muito) — ainda marca inativo se ≥ threshold
  if (daysSince >= cfg.inactiveDays) {
    const inWindow = daysSince <= cfg.actionableWindowDays;
    return {
      ...base,
      frequency: "inativo",
      dueForReturn: inWindow,
      label: labelCrmFrequency("inativo"),
    };
  }

  const interval = avg ?? cfg.defaultIntervalDays;
  const low = interval * cfg.windowLow;
  const high = interval * cfg.windowHigh;

  if (daysSince >= high) {
    return {
      ...base,
      frequency: "risco",
      dueForReturn: true,
      label: labelCrmFrequency("risco"),
    };
  }
  if (daysSince >= low) {
    return {
      ...base,
      frequency: "janela",
      dueForReturn: true,
      label: labelCrmFrequency("janela"),
    };
  }

  return {
    ...base,
    frequency: "recorrente",
    dueForReturn: false,
    label: labelCrmFrequency("recorrente"),
  };
}

/** Monta stats a partir de datas de visita ordenadas (asc). */
export function visitStatsFromDates(
  dates: Date[],
  inactiveDays = CRM_FREQUENCY_DEFAULTS.inactiveDays
): CrmVisitStats {
  const sorted = [...dates]
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length === 0) {
    return {
      visitCount: 0,
      firstAt: null,
      lastAt: null,
      avgIntervalDays: null,
      hadLongGap: false,
    };
  }
  let hadLongGap = false;
  let sumIntervals = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1], sorted[i]);
    sumIntervals += gap;
    if (gap >= inactiveDays) hadLongGap = true;
  }
  return {
    visitCount: sorted.length,
    firstAt: sorted[0],
    lastAt: sorted[sorted.length - 1],
    avgIntervalDays:
      sorted.length >= 2 ? Math.round(sumIntervals / (sorted.length - 1)) : null,
    hadLongGap,
  };
}
