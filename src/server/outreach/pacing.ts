import type { OutreachKind } from "./defaults";
import { stableHash } from "./templates";

/** Política conservadora anti-rajada (Evolution / risk Meta). */

/** Ordem de prioridade — 1 kind por tick (o mais prioritário com jobs pending). */
export const OUTREACH_KIND_PRIORITY: OutreachKind[] = [
  "confirmation_daily",
  "empty_agenda",
  "followup_inactive",
  "birthday",
  "voce_vem",
  "delay_reschedule",
  "sunday_blast", // último de propósito
  "manual",
  "campaign",
];

/** Intervalo mínimo entre envios no mesmo tick (ms). */
export const OUTREACH_MIN_INTERVAL_MS = 4_000;

/** Jitter aleatório adicional 0..N ms. */
export const OUTREACH_JITTER_MS = 3_000;

/** Teto de mensagens enviadas por hora (tenant), contando status=sent. */
export const OUTREACH_HOURLY_CAP = 30;

/** Default teto diário (sobrescrito por settings.dailyCap). */
export const OUTREACH_DAILY_CAP_DEFAULT = 100;

/** Máximo de jobs processados por tick (após pacing). */
export const OUTREACH_TICK_BATCH = 8;

/** Cap de clientes por barbeiro no planner empty_agenda. */
export const EMPTY_AGENDA_CLIENT_CAP = 8;

/** Não reenviar empty_agenda ao mesmo telefone nestes dias. */
export const EMPTY_AGENDA_COOLDOWN_DAYS = 14;

/** Quiet hours SP: sem envio de 22:00 até 07:59. */
export const OUTREACH_QUIET_START_HOUR = 22;
export const OUTREACH_QUIET_END_HOUR = 8;

/** Janela de espalhamento em torno do horário âncora (minutos). */
export const OUTREACH_WINDOW_BEFORE_MIN = 30;
export const OUTREACH_WINDOW_AFTER_MIN = 60;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pacingDelayMs(): number {
  const jitter = Math.floor(Math.random() * (OUTREACH_JITTER_MS + 1));
  return OUTREACH_MIN_INTERVAL_MS + jitter;
}

export function pickPriorityKind(
  pendingKinds: string[]
): OutreachKind | null {
  const set = new Set(pendingKinds);
  for (const kind of OUTREACH_KIND_PRIORITY) {
    if (set.has(kind)) return kind;
  }
  return (pendingKinds[0] as OutreachKind) ?? null;
}

export function parseHmToMinutes(hm: string): number {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 18 * 60;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

export function minutesToHm(total: number): string {
  const clamped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Date SP a partir de YYYY-MM-DD + HH:mm. */
export function dateTimeSp(dateStr: string, hm: string): Date {
  const [hRaw, mRaw] = hm.split(":");
  const h = String(Math.min(23, Math.max(0, Number(hRaw) || 0))).padStart(2, "0");
  const m = String(Math.min(59, Math.max(0, Number(mRaw) || 0))).padStart(2, "0");
  return new Date(`${dateStr}T${h}:${m}:00-03:00`);
}

/**
 * Espalha scheduledAt na janela [âncora - before, âncora + after]
 * com offset determinístico por telefone+dayKey.
 */
export function spreadScheduledAt(input: {
  dateStr: string;
  anchorHm: string;
  phoneE164: string;
  dayKey: string;
  windowBeforeMin?: number;
  windowAfterMin?: number;
}): Date {
  const before = input.windowBeforeMin ?? OUTREACH_WINDOW_BEFORE_MIN;
  const after = input.windowAfterMin ?? OUTREACH_WINDOW_AFTER_MIN;
  const span = Math.max(1, before + after);
  const offset = stableHash(`${input.phoneE164}|${input.dayKey}|sched`) % span;
  const anchorMin = parseHmToMinutes(input.anchorHm);
  const targetMin = anchorMin - before + offset;
  return dateTimeSp(input.dateStr, minutesToHm(targetMin));
}

export function isQuietHoursSp(now = new Date()): boolean {
  const hour = Number(
    now.toLocaleString("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    })
  );
  return hour >= OUTREACH_QUIET_START_HOUR || hour < OUTREACH_QUIET_END_HOUR;
}

/** Está dentro da janela de envio do kind (âncora ± janela)? */
export function isInsideSendWindowSp(
  anchorHm: string,
  now = new Date(),
  windowBeforeMin = OUTREACH_WINDOW_BEFORE_MIN,
  windowAfterMin = OUTREACH_WINDOW_AFTER_MIN
): boolean {
  if (isQuietHoursSp(now)) return false;
  const cur = now.toLocaleTimeString("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const curMin = parseHmToMinutes(cur);
  const anchor = parseHmToMinutes(anchorHm);
  const start = anchor - windowBeforeMin;
  const end = anchor + windowAfterMin;
  return curMin >= start && curMin <= end;
}
