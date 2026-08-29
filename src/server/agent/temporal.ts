/**
 * Inteligência temporal America/Sao_Paulo — fonte da verdade para a Donna.
 * Nunca inventar weekday: sempre calcular a partir do calendário.
 */
import { formatDateSp, parseDateSp, shiftDateSp, todaySp } from "@/lib/datetime";

const TZ = "America/Sao_Paulo";

const WEEKDAY_PT: Record<number, string> = {
  0: "domingo",
  1: "segunda-feira",
  2: "terça-feira",
  3: "quarta-feira",
  4: "quinta-feira",
  5: "sexta-feira",
  6: "sábado",
};

const WEEKDAY_SHORT: Record<number, string> = {
  0: "domingo",
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
};

const NAME_TO_WD: Record<string, number> = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  "segunda-feira": 1,
  seg: 1,
  terca: 2,
  "terca-feira": 2,
  terça: 2,
  "terça-feira": 2,
  ter: 2,
  quarta: 3,
  "quarta-feira": 3,
  qua: 3,
  quinta: 4,
  "quinta-feira": 4,
  qui: 4,
  sexta: 5,
  "sexta-feira": 5,
  sex: 5,
  sabado: 6,
  sábado: 6,
  "sabado-feira": 6,
  sab: 6,
};

export type ResolvedDate = {
  date: string;
  weekday: string;
  weekdayShort: string;
  weekdayIndex: number;
  label: string;
  dateBr: string;
  source: string;
  /** Cliente citou um dia da semana que não bate com a data */
  mismatchWeekday?: boolean;
  claimedWeekday?: string | null;
  note?: string;
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalize(s: string): string {
  return stripAccents(s.toLowerCase().trim()).replace(/\s+/g, " ");
}

function hourSp(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
}

export function weekdayIndexOfDate(dateStr: string): number {
  const label = parseDateSp(dateStr).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? parseDateSp(dateStr).getDay();
}

export function describeDate(dateStr: string): ResolvedDate {
  const idx = weekdayIndexOfDate(dateStr);
  const d = parseDateSp(dateStr);
  const dateBr = d.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const weekday = WEEKDAY_PT[idx]!;
  return {
    date: dateStr,
    weekday,
    weekdayShort: WEEKDAY_SHORT[idx]!,
    weekdayIndex: idx,
    dateBr,
    label: `${weekday}, ${dateBr}`,
    source: "calendar",
  };
}

/** Próxima ocorrência do weekday (0=dom…6=sáb). Se for hoje e beforeCutoffHour, usa hoje. */
export function nextWeekdayDate(
  weekday: number,
  opts: { from?: Date; skipToday?: boolean; beforeCutoffHour?: number } = {}
): string {
  const from = opts.from ?? new Date();
  const today = formatDateSp(from);
  const todayWd = weekdayIndexOfDate(today);
  const cutoff = opts.beforeCutoffHour ?? 18;

  if (!opts.skipToday && todayWd === weekday && hourSp(from) < cutoff) {
    return today;
  }

  let days = (weekday - todayWd + 7) % 7;
  if (days === 0) days = 7;
  return shiftDateSp(today, days);
}

/** Segunda da semana civil seguinte (seg–dom). */
export function nextWeekMonday(from = new Date()): string {
  const today = formatDateSp(from);
  const wd = weekdayIndexOfDate(today);
  const daysUntilNextMonday = wd === 0 ? 1 : 8 - wd;
  return shiftDateSp(today, daysUntilNextMonday);
}

function parseAbsoluteDate(raw: string, now = new Date()): string | null {
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = raw.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
  if (!br) return null;
  const day = Number(br[1]);
  const month = Number(br[2]);
  let year = br[3] ? Number(br[3]) : Number(todaySp().slice(0, 4));
  if (br[3] && br[3].length === 2) year = 2000 + year;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  let date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Se DD/MM sem ano já passou (ex.: hoje 29/08 e pediu 01/08), assume ano seguinte
  if (!br[3] && date < formatDateSp(now)) {
    date = `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return date;
}

function findClaimedWeekday(norm: string): number | null {
  for (const [name, wd] of Object.entries(NAME_TO_WD)) {
    const n = normalize(name);
    if (n.length < 3) continue;
    if (new RegExp(`\\b${n}(?:-feira)?\\b`).test(norm)) return wd;
  }
  return null;
}

/**
 * Resolve frase relativa/absoluta do cliente para YYYY-MM-DD + weekday real.
 * Exemplos: "próxima segunda", "amanhã", "quarta que vem", "1/9", "segunda dia 01/09".
 */
export function resolveTemporalPhrase(phrase: string, now = new Date()): ResolvedDate | null {
  const raw = phrase.trim();
  if (!raw) return null;
  const norm = normalize(raw);

  const claimedWd = findClaimedWeekday(norm);
  const absolute = parseAbsoluteDate(raw, now);

  if (absolute) {
    const desc = describeDate(absolute);
    desc.source = "absolute";
    if (claimedWd != null && claimedWd !== desc.weekdayIndex) {
      desc.mismatchWeekday = true;
      desc.claimedWeekday = WEEKDAY_SHORT[claimedWd]!;
      desc.note = `${desc.dateBr} é ${desc.weekday} (não ${desc.claimedWeekday}). Use o dia real do calendário e confirme com o cliente.`;
    }
    return desc;
  }

  if (/\bhoje\b/.test(norm)) {
    return { ...describeDate(formatDateSp(now)), source: "hoje" };
  }
  if (/\bdepois\s+de\s+amanha\b/.test(norm)) {
    return { ...describeDate(shiftDateSp(formatDateSp(now), 2)), source: "depois de amanhã" };
  }
  if (/\bamanha\b/.test(norm)) {
    return { ...describeDate(shiftDateSp(formatDateSp(now), 1)), source: "amanhã" };
  }

  if (claimedWd == null) return null;

  const weekQueVem =
    /\bsemana\s+que\s+vem\b/.test(norm) || /\bda\s+proxima\s+semana\b/.test(norm);
  const queVem = /\bque\s+vem\b/.test(norm) || /\bproxima\b/.test(norm) || /\bproximo\b/.test(norm);
  const essa = /\b(essa|esta|desse|deste)\b/.test(norm);

  let date: string;
  let source: string;

  if (weekQueVem) {
    const monday = nextWeekMonday(now);
    date = shiftDateSp(monday, claimedWd === 0 ? 6 : claimedWd - 1);
    source = "semana que vem";
  } else if (queVem || !essa) {
    // "próxima segunda" / "segunda" / "segunda que vem"
    const skipToday = /\bque\s+vem\b/.test(norm) && weekdayIndexOfDate(formatDateSp(now)) === claimedWd;
    date = nextWeekdayDate(claimedWd, { from: now, skipToday });
    source = queVem ? "próxima/que vem" : "dia da semana";
  } else {
    // essa/esta segunda → ocorrência nesta semana se ainda não passou; senão próxima
    const today = formatDateSp(now);
    const todayWd = weekdayIndexOfDate(today);
    const delta = claimedWd - todayWd;
    if (delta < 0 || (delta === 0 && hourSp(now) >= 18)) {
      date = nextWeekdayDate(claimedWd, { from: now, skipToday: true });
      source = "essa (já passou → próxima)";
    } else {
      date = shiftDateSp(today, delta);
      source = "essa/esta";
    }
  }

  return { ...describeDate(date), source };
}

/** Bloco de calendário para o system prompt — âncora factual. */
export function buildCalendarContext(now = new Date()): string {
  const today = formatDateSp(now);
  const todayDesc = describeDate(today);
  const h = hourSp(now);
  const lines: string[] = [
    `CALENDÁRIO (America/Sao_Paulo — fonte da verdade; NUNCA invente dia da semana):`,
    `Hoje: ${todayDesc.label} (${h}h).`,
    `Próximos 14 dias:`,
  ];
  for (let i = 0; i <= 14; i += 1) {
    const d = shiftDateSp(today, i);
    const desc = describeDate(d);
    const tag = i === 0 ? " ← HOJE" : i === 1 ? " ← amanhã" : "";
    lines.push(`- ${desc.weekdayShort} ${desc.dateBr} (${desc.date})${tag}`);
  }
  lines.push(
    `Atalhos: "próxima segunda" / "segunda que vem" = próxima ocorrência real; "amanhã" = dia seguinte; "1/9" = data absoluta (confira o weekday na lista).`
  );
  return lines.join("\n");
}
