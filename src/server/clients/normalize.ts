/** Normaliza telefone BR para exibição e E.164. */
export function normalizePhone(input: string | null | undefined): {
  phone: string | null;
  phoneE164: string | null;
} {
  const raw = String(input ?? "").trim();
  if (!raw) return { phone: null, phoneE164: null };

  const digits = raw.replace(/\D/g, "");
  if (!digits) return { phone: raw.slice(0, 32), phoneE164: null };

  let national = digits;
  if (national.startsWith("55") && national.length >= 12) {
    national = national.slice(2);
  }

  let formatted = raw.slice(0, 32);
  if (national.length === 11) {
    formatted = `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  } else if (national.length === 10) {
    formatted = `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }

  const phoneE164 = national.length >= 10 ? `+55${national}` : null;
  return { phone: formatted, phoneE164 };
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  return s.slice(0, 200);
}

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 160);
}
