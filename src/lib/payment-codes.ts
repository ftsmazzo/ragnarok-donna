import { labelPaymentMethod } from "@/lib/format";

const ENUM_METHODS = new Set([
  "cash",
  "pix",
  "pix_key",
  "debit",
  "credit",
  "transfer",
  "rede_link",
  "infinity",
  "client_account",
  "other",
]);

/** Código da UI (bandeira/parcelas) → enum existente + meta. Sem migration. */
export function resolvePaymentCode(code: string): {
  method: string;
  meta: Record<string, unknown>;
} {
  const raw = code.trim();
  if (raw === "parceria") return { method: "other", meta: { kind: "parceria" } };

  const infinity = raw.match(/^infinity_([234])_(visa_master|elo_amex)$/);
  if (infinity) {
    return {
      method: "infinity",
      meta: { installments: Number(infinity[1]), brand: infinity[2] },
    };
  }

  const card = raw.match(/^(credit|debit)_(visa_master|elo_amex)$/);
  if (card) return { method: card[1], meta: { brand: card[2] } };

  if (ENUM_METHODS.has(raw)) return { method: raw, meta: {} };
  return { method: raw, meta: {} };
}

function brandLabel(brand: unknown): string {
  if (brand === "visa_master") return "Visa/Master";
  if (brand === "elo_amex") return "Elo/Amex";
  return "";
}

export function labelStoredPayment(
  method: string,
  meta?: Record<string, unknown> | null
): string {
  const extra = meta ?? {};
  if (extra.kind === "parceria") return "Parceria";
  const brand = brandLabel(extra.brand);
  const installments =
    typeof extra.installments === "number" && extra.installments >= 2
      ? extra.installments
      : 0;
  if (method === "infinity" && installments && brand) {
    return `Infinity ${installments}x ${brand}`;
  }
  if (method === "infinity" && installments) return `Infinity ${installments}x`;
  if (method === "credit" && brand) return `Crédito ${brand}`;
  if (method === "debit" && brand) return `Débito ${brand}`;
  if (method === "rede_link") return "Link de pagamento";
  if (method === "pix_key") return "Chave PIX";
  return labelPaymentMethod(method);
}
