/**
 * Extrai do histórico do Zap o que o cliente pediu originalmente
 * (profissional, hora, data, serviço) para preencher a lista de espera.
 */
import { resolveTemporalPhrase } from "./temporal";

export type WaitlistContextFromThread = {
  staffName: string | null;
  serviceQuery: string | null;
  desiredDate: string | null;
  preferredHour: number | null;
  notes: string;
};

const SERVICE_WORDS =
  /\b(barba|corte|combo|sobrancelha|pigment|luzes|escova|hidrata|progressiva|manicure|pedicure|design)\w*\b/i;

function stripRole(line: string): string {
  return line.replace(/^(cliente|donna|recepção|sistema):\s*/i, "");
}

function extractHour(text: string): number | null {
  const re = /(?:às|as|á)\s*(\d{1,2})\s*h?\b|(\d{1,2})\s*h\b|(\d{1,2}):00\b/gi;
  let last: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const h = Number(m[1] || m[2] || m[3]);
    if (h >= 7 && h <= 22) last = h;
  }
  return last;
}

function extractStaffName(text: string): string | null {
  // "com o Diego", "com Diego", "do Diego"
  const m =
    text.match(/\b(?:com|do|da)\s+(?:o|a)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÀÜ][\wÁÉÍÓÚÂÊÔÃÕÀÜáéíóúâêôãõàü'-]+)/) ||
    text.match(/\b(?:com|do|da)\s+(?:o|a)?\s*([a-záéíóúâêôãõàü]{3,})/i);
  if (!m?.[1]) return null;
  const name = m[1].trim();
  if (/^(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|horario|horário)$/i.test(name)) {
    return null;
  }
  return name;
}

function extractDateBr(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!m) return null;
  const resolved = resolveTemporalPhrase(m[0]);
  return resolved?.date ?? null;
}

export function extractWaitlistContextFromThread(
  history: string[],
  currentUserText = ""
): WaitlistContextFromThread {
  const inbound = history
    .filter((h) => h.startsWith("cliente:"))
    .map(stripRole)
    .join("\n");
  const donna = history
    .filter((h) => h.startsWith("donna:"))
    .map(stripRole)
    .join("\n");
  const corpus = `${inbound}\n${currentUserText}\n${donna}`;

  // Preferência do CLIENTE (pedido original), não das alternativas
  const staffFromClient = extractStaffName(`${inbound}\n${currentUserText}`);
  const staffFromDonnaOccupied =
    donna.match(/(?:do|da)\s+([A-Za-zÁÉÍÓÚÂÊÔÃÕÀÜáéíóúâêôãõàü]+)\s+na\s+/i)?.[1] ||
    donna.match(/As?\s+\d{1,2}h\s+do\s+([A-Za-zÁÉÍÓÚÂÊÔÃÕÀÜáéíóúâêôãõàü]+)/i)?.[1] ||
    null;
  const staffName = staffFromClient || staffFromDonnaOccupied;

  const preferredHour =
    extractHour(`${inbound}\n${currentUserText}`) ?? extractHour(donna);

  let desiredDate =
    extractDateBr(donna) ||
    extractDateBr(inbound) ||
    resolveTemporalPhrase(`${inbound}\n${currentUserText}`)?.date ||
    null;

  // Donna costuma citar "segunda 31/08" no início da mensagem de ocupado
  if (!desiredDate) {
    const m = donna.match(
      /\b(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)\s+(\d{1,2})\/(\d{1,2})\b/i
    );
    if (m) {
      desiredDate = resolveTemporalPhrase(`${m[2]}/${m[3]}`)?.date ?? null;
    }
  }

  const serviceMatch = `${inbound}\n${currentUserText}`.match(SERVICE_WORDS);
  const serviceQuery = serviceMatch?.[1]?.toLowerCase() ?? null;

  const hourLabel =
    preferredHour != null ? `${String(preferredHour).padStart(2, "0")}:00` : null;
  const parts = [
    hourLabel ? `deseja ${hourLabel}` : null,
    staffName ? `com ${staffName}` : null,
    desiredDate ? `em ${desiredDate}` : null,
    serviceQuery ? `(${serviceQuery})` : null,
    "aceito via Zap",
  ].filter(Boolean);

  return {
    staffName,
    serviceQuery,
    desiredDate,
    preferredHour,
    notes: parts.join(" ").slice(0, 500),
  };
}
