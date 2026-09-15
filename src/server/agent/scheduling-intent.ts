/**
 * Especialista determinístico de agenda — o LLM não manda na data.
 * DD/MM (ou ISO) na mensagem do cliente sempre ganha sobre weekday sozinho.
 */
import {
  describeDate,
  resolveTemporalPhrase,
  type ResolvedDate,
} from "./temporal";

export type SchedulingIntent = {
  date: string | null;
  dateBr: string | null;
  dateLabel: string | null;
  weekdayShort: string | null;
  /** Frase canônica para as tools (mensagem do cliente quando há data). */
  datePhrase: string | null;
  staffName: string | null;
  preferredHour: number | null;
  /** Cliente citou DD/MM ou YYYY-MM-DD nesta mensagem. */
  absoluteDatePresent: boolean;
  resolved: ResolvedDate | null;
};

const ABSOLUTE_DATE_RE =
  /\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?)\b/;

const STAFF_STOP =
  /^(amanh[aã]|hoje|tarde|manh[aã]|corte|barba|combo|horario|horário|mesmo|voce|você|ele|ela|sabado|sábado|segunda|terca|terça|quarta|quinta|sexta|domingo)$/i;

function hasAbsoluteDateToken(text: string): boolean {
  return ABSOLUTE_DATE_RE.test(text);
}

export function extractPreferredHourFromText(text: string): number | null {
  const timeRe =
    /(?:às|as|á)\s*(\d{1,2})\s*h?\b|(\d{1,2})\s*h(?:\d{2})?\b|(\d{1,2}):(\d{2})\b/gi;
  let inferred: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = timeRe.exec(text))) {
    const h = Number(m[1] || m[2] || m[3]);
    if (h >= 7 && h <= 22) inferred = h;
  }
  return inferred;
}

export function extractStaffNameFromText(text: string): string | null {
  const staffHint =
    /(?:com\s+(?:o|a)\s+|quero\s+(?:o|a)\s+|do\s+|da\s+)([A-Za-zÁ-ú]{3,})/i.exec(text) ||
    /\b(?:luciano|diego|guilherme|gustavo|diogo|marcos)\b/i.exec(text);
  const name = staffHint?.[1]?.trim() || staffHint?.[0]?.trim() || null;
  if (!name || STAFF_STOP.test(name)) return null;
  return name;
}

/**
 * Extrai intenção de agendamento da mensagem atual (e opcionalmente inbound prévio).
 * Preferência: mensagem atual; absoluto DD/MM sempre vence.
 */
export function extractSchedulingIntent(
  userText: string,
  opts?: { inboundHistory?: string; now?: Date }
): SchedulingIntent {
  const now = opts?.now ?? new Date();
  const text = userText.trim();
  const inbound = (opts?.inboundHistory ?? "").trim();
  const absoluteDatePresent = hasAbsoluteDateToken(text);

  // Frase para o parser: se a msg atual tem DD/MM, usa ela inteira (não o resumo do LLM).
  // Senão tenta a msg atual; se não resolver data, tenta inbound+atual.
  let resolved: ResolvedDate | null = null;
  let datePhrase: string | null = null;

  if (text) {
    resolved = resolveTemporalPhrase(text, now);
    if (resolved) datePhrase = text;
  }
  if (!resolved && inbound) {
    const combined = `${inbound}\n${text}`;
    resolved = resolveTemporalPhrase(combined, now);
    if (resolved) datePhrase = combined;
  }

  // Se a msg atual tem absoluto, re-resolve só com ela (não deixa histórico puxar outro dia).
  if (absoluteDatePresent && text) {
    resolved = resolveTemporalPhrase(text, now);
    datePhrase = text;
  }

  const preferredHour = extractPreferredHourFromText(text);
  const staffName = extractStaffNameFromText(text);

  if (!resolved) {
    return {
      date: null,
      dateBr: null,
      dateLabel: null,
      weekdayShort: null,
      datePhrase: absoluteDatePresent ? text : datePhrase,
      staffName,
      preferredHour,
      absoluteDatePresent,
      resolved: null,
    };
  }

  const desc = describeDate(resolved.date);
  return {
    date: resolved.date,
    dateBr: resolved.dateBr || desc.dateBr,
    dateLabel: resolved.label || desc.label,
    weekdayShort: resolved.weekdayShort || desc.weekdayShort,
    datePhrase: datePhrase || text,
    staffName,
    preferredHour,
    absoluteDatePresent,
    resolved,
  };
}

/**
 * Aplica a intenção determinística nos args das tools — sobrescreve o LLM.
 */
export function applySchedulingIntentToToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  intent: SchedulingIntent
): Record<string, unknown> {
  const next = { ...args };

  if (toolName === "resolve_date") {
    if (intent.absoluteDatePresent && intent.datePhrase) {
      next.phrase = intent.datePhrase;
    } else if (intent.datePhrase && (!next.phrase || isWeekdayOnlyPhrase(String(next.phrase)))) {
      next.phrase = intent.datePhrase;
    } else if (!next.phrase && intent.datePhrase) {
      next.phrase = intent.datePhrase;
    }
    return next;
  }

  if (toolName === "list_slots" || toolName === "book_appointment") {
    if (intent.date) {
      const llmDate = String(next.date ?? "").trim();
      const shouldForce =
        intent.absoluteDatePresent ||
        !/^\d{4}-\d{2}-\d{2}$/.test(llmDate) ||
        llmDate !== intent.date ||
        isWeekdayOnlyPhrase(String(next.datePhrase ?? next.phrase ?? ""));

      if (shouldForce) {
        next.date = intent.date;
        if (intent.datePhrase) next.datePhrase = intent.datePhrase;
      }
    } else if (intent.datePhrase && !next.datePhrase && !next.date) {
      next.datePhrase = intent.datePhrase;
    }

    if (intent.preferredHour != null && (next.preferredHour == null || next.preferredHour === "")) {
      next.preferredHour = intent.preferredHour;
    }
    if (intent.staffName && !next.staffId && !next.staffName) {
      next.staffName = intent.staffName;
    }
    if (intent.staffName) {
      next.clientRequestedStaff = intent.staffName;
    }
  }

  return next;
}

/** Frase que é só weekday (ex.: "sábado") — sem DD/MM. */
export function isWeekdayOnlyPhrase(phrase: string): boolean {
  const t = phrase.trim();
  if (!t) return false;
  if (hasAbsoluteDateToken(t)) return false;
  if (/\b(hoje|amanh[aã]|depois\s+de\s+amanh[aã])\b/i.test(t)) return false;
  return /^(?:pr[oó]xim[oa]\s+|essa\s+|esta\s+)?(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira)?(?:\s+que\s+vem)?$/i.test(
    t.normalize("NFD").replace(/\p{M}/gu, "")
  );
}
