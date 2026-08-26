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

export function shortPersonName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}
