import { normalizePhone } from "@/server/clients/normalize";

function jidHost(jid: string): string {
  const at = jid.indexOf("@");
  return at >= 0 ? jid.slice(at + 1).toLowerCase() : "";
}

function isPhoneHost(host: string): boolean {
  return host === "s.whatsapp.net" || host === "c.us";
}

function isLidHost(host: string): boolean {
  return host === "lid";
}

/** Converte JID WhatsApp clássico (…@s.whatsapp.net) → E.164 (+55…). */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const host = jidHost(jid);
  if (isLidHost(host)) return null;
  if (host === "g.us" || host.includes("broadcast") || jid.toLowerCase().startsWith("status@")) {
    return null;
  }
  if (jid.toLowerCase().startsWith("0@")) return null;

  // Com @, só aceita host de telefone — nunca digitos de LID/outros
  if (host && !isPhoneHost(host)) return null;

  const raw = jid.split("@")[0]?.split(":")[0] ?? "";
  const digits = raw.replace(/\D/g, "");
  // BR E.164: 10–11 nacionais, ou 12–13 com 55. LID costuma ser >13.
  if (!digits || digits.length < 10 || digits.length > 13) return null;

  const { phoneE164 } = normalizePhone(digits.startsWith("55") ? digits : `+55${digits}`);
  if (!phoneE164) return null;
  // Sanidade: E.164 BR válido tem 12 ou 13 dígitos (+55…)
  const e164Digits = phoneE164.replace(/\D/g, "");
  if (e164Digits.length < 12 || e164Digits.length > 13) return null;
  return phoneE164;
}

function isPhoneJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  return isPhoneHost(jidHost(jid));
}

/**
 * WhatsApp moderno usa addressingMode=lid:
 *   remoteJid = "…@lid"          ← código interno (NÃO é telefone)
 *   remoteJidAlt = "5516…@s.whatsapp.net"  ← telefone real
 * Em alguns payloads o telefone vem em remoteJid e o LID em remoteJidAlt.
 */
export function phoneFromMessageKey(key: {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  participant?: string | null;
  participantAlt?: string | null;
} | null | undefined): string | null {
  if (!key) return null;
  const candidates = [
    key.remoteJidAlt,
    key.participantAlt,
    key.remoteJid,
    key.participant,
  ].filter((j): j is string => Boolean(j));

  // 1) Só JIDs de telefone (@s.whatsapp.net / @c.us)
  for (const jid of candidates) {
    if (!isPhoneJid(jid)) continue;
    const phone = phoneFromJid(jid);
    if (phone) return phone;
  }

  // 2) Fallback: qualquer candidato que phoneFromJid aceite (sem @lid)
  for (const jid of candidates) {
    const phone = phoneFromJid(jid);
    if (phone) return phone;
  }
  return null;
}

/** Extrai telefone exibível a partir do meta da conversa + phoneE164 salvo. */
export function resolveDisplayPhone(input: {
  phoneE164: string;
  meta?: Record<string, unknown> | null;
}): string {
  const meta = input.meta ?? {};
  const alt = typeof meta.remoteJidAlt === "string" ? meta.remoteJidAlt : null;
  const lid = typeof meta.remoteJidLid === "string" ? meta.remoteJidLid : null;

  const fromAlt = phoneFromJid(alt);
  if (fromAlt) return fromAlt;

  // phoneE164 só se parecer telefone BR de verdade (não LID formatado)
  const stored = phoneFromJid(
    input.phoneE164.includes("@")
      ? input.phoneE164
      : `${input.phoneE164.replace(/\D/g, "")}@s.whatsapp.net`
  );
  if (stored) return stored;

  // Último recurso: se phoneE164 já é E.164 curto, usa
  const digits = input.phoneE164.replace(/\D/g, "");
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) {
    return input.phoneE164.startsWith("+") ? input.phoneE164 : `+${digits}`;
  }

  void lid;
  return input.phoneE164;
}

/** Meta de JID para persistir na conversa (telefone vs LID separados). */
export function buildJidMeta(input: {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
}): Record<string, string> {
  const meta: Record<string, string> = {};
  const a = input.remoteJid?.trim() || null;
  const b = input.remoteJidAlt?.trim() || null;

  for (const jid of [a, b]) {
    if (!jid) continue;
    if (isLidHost(jidHost(jid))) meta.remoteJidLid = jid;
    else if (isPhoneJid(jid)) meta.remoteJidAlt = jid;
  }

  // Se só veio telefone em remoteJid
  if (!meta.remoteJidAlt && a && isPhoneJid(a)) meta.remoteJidAlt = a;
  if (!meta.remoteJidAlt && b && isPhoneJid(b)) meta.remoteJidAlt = b;

  return meta;
}

/** E.164 → dígitos para API Evolution (sem +). */
export function digitsForEvolution(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "");
}
