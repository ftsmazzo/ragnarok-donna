import type { OutreachKind } from "./defaults";

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

/** Máximo de jobs processados por tick (após pacing). */
export const OUTREACH_TICK_BATCH = 8;

/** Cap de clientes por barbeiro no planner empty_agenda. */
export const EMPTY_AGENDA_CLIENT_CAP = 8;

/** Não reenviar empty_agenda ao mesmo telefone nestes dias. */
export const EMPTY_AGENDA_COOLDOWN_DAYS = 14;

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
