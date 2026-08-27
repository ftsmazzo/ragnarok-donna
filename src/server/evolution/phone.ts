import { normalizePhone } from "@/server/clients/normalize";

/** Converte JID WhatsApp clássico (…@s.whatsapp.net) → E.164 (+55…). */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const lower = jid.toLowerCase();
  if (lower.endsWith("@lid")) return null;
  if (lower.endsWith("@g.us") || lower.includes("@broadcast") || lower.startsWith("status@")) {
    return null;
  }
  if (lower.startsWith("0@")) return null;

  const raw = jid.split("@")[0]?.split(":")[0] ?? "";
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length < 10 || digits.length > 15) return null;

  const { phoneE164 } = normalizePhone(digits.startsWith("55") ? digits : `+55${digits}`);
  return phoneE164;
}

/**
 * WhatsApp moderno usa addressingMode=lid:
 *   remoteJid = "…@lid"
 *   remoteJidAlt = "5516…@s.whatsapp.net"  ← telefone real
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
  ];
  for (const jid of candidates) {
    const phone = phoneFromJid(jid);
    if (phone) return phone;
  }
  return null;
}

/** E.164 → dígitos para API Evolution (sem +). */
export function digitsForEvolution(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "");
}
