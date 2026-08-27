import { normalizePhone } from "@/server/clients/normalize";

/** Converte JID WhatsApp → E.164 (+55…). */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const raw = jid.split("@")[0]?.split(":")[0] ?? "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const { phoneE164 } = normalizePhone(digits.startsWith("55") ? digits : `+55${digits}`);
  return phoneE164;
}

/** E.164 → dígitos para API Evolution (sem +). */
export function digitsForEvolution(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "");
}
