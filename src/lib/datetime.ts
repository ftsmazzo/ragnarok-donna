const TZ = "America/Sao_Paulo";

/** YYYY-MM-DD no fuso de São Paulo */
export function formatDateSp(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function parseDateSp(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00-03:00`);
}

export function dayBoundsSp(dateStr?: string) {
  const date = dateStr ?? formatDateSp(new Date());
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(`${date}T23:59:59.999-03:00`);
  return { date, start, end };
}

export function hourInSp(d: Date): number {
  const h = d.toLocaleString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hour12: false,
  });
  return Number(h);
}

export function formatTimeSp(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateLabelSp(dateStr: string): string {
  const d = parseDateSp(dateStr);
  return d.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function shiftDateSp(dateStr: string, days: number): string {
  const d = parseDateSp(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateSp(d);
}

export function todaySp(): string {
  return formatDateSp(new Date());
}

export function monthStartSp(): string {
  const today = todaySp();
  return `${today.slice(0, 8)}01`;
}

/** Segunda → domingo da semana civil em America/Sao_Paulo. */
export function weekBoundsSp(anchorDate = todaySp()): { from: string; to: string } {
  const label = parseDateSp(anchorDate).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
  });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = map[label] ?? 0;
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  const from = shiftDateSp(anchorDate, mondayOffset);
  const to = shiftDateSp(from, 6);
  return { from, to };
}

/** Resolve preset de relatório: week | month | custom (from/to). */
export function resolveReportPeriod(input?: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
}): { period: "week" | "month" | "custom"; from: string; to: string } {
  const today = todaySp();
  const periodRaw = (input?.period ?? "").toLowerCase().trim();

  if (periodRaw === "week" || periodRaw === "semana") {
    const w = weekBoundsSp(today);
    return { period: "week", from: w.from, to: today < w.to ? today : w.to };
  }

  if (periodRaw === "custom" && input?.from && input?.to) {
    return { period: "custom", from: input.from, to: input.to };
  }

  if (periodRaw === "month" || periodRaw === "mes" || periodRaw === "mês" || !periodRaw) {
    if (!periodRaw && input?.from && input?.to) {
      return { period: "custom", from: input.from, to: input.to };
    }
    return { period: "month", from: monthStartSp(), to: today };
  }

  if (input?.from && input?.to) {
    return { period: "custom", from: input.from, to: input.to };
  }

  return { period: "month", from: monthStartSp(), to: today };
}

/** N dias atrás (inclusivo: 0 = hoje) */
export function daysAgoSp(days: number): string {
  return shiftDateSp(todaySp(), -days);
}

export function rangeBoundsSp(from: string, to: string) {
  const start = new Date(`${from}T00:00:00-03:00`);
  const end = new Date(`${to}T23:59:59.999-03:00`);
  return { from, to, start, end };
}

export function formatDateTimeSp(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortPersonName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}
