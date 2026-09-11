import { formatDateSp, parseDateSp } from "@/lib/datetime";

/** Feriados nacionais fixos MM-DD (sem móveis). */
const FIXED_BR_HOLIDAYS = new Set([
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
]);

/** Páscoa aproximada (Anonymous Gregorian) → Carnaval / Sexta Santa / Corpus. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function movableBrHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  return new Set([
    ymdUtc(addDaysUtc(easter, -48)), // Carnaval (terça)
    ymdUtc(addDaysUtc(easter, -47)), // Carnaval (quarta ash-ish buffer — terça/qua)
    ymdUtc(addDaysUtc(easter, -2)), // Sexta-feira Santa
    ymdUtc(easter),
    ymdUtc(addDaysUtc(easter, 60)), // Corpus Christi
  ]);
}

export function isSundaySp(dateStr: string): boolean {
  const d = parseDateSp(dateStr);
  const wd = d.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
  return wd === "Sun";
}

export function isBrHoliday(dateStr: string): boolean {
  const mmdd = dateStr.slice(5);
  if (FIXED_BR_HOLIDAYS.has(mmdd)) return true;
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return movableBrHolidays(year).has(dateStr);
}

export function isClosedForOutreach(
  dateStr: string,
  opts: { skipSundays: boolean; skipHolidays: boolean; customClosedDates: string[] }
): boolean {
  if (opts.customClosedDates.includes(dateStr)) return true;
  if (opts.skipSundays && isSundaySp(dateStr)) return true;
  if (opts.skipHolidays && isBrHoliday(dateStr)) return true;
  return false;
}

/** HH:mm no fuso SP agora. */
export function currentTimeHmSp(now = new Date()): string {
  return now.toLocaleTimeString("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function timeReachedSp(targetHm: string, now = new Date()): boolean {
  const cur = currentTimeHmSp(now);
  return cur >= targetHm;
}

export function todaySpStr(now = new Date()): string {
  return formatDateSp(now);
}
