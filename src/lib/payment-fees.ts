/**
 * Taxas de adquirente (Donna / Fred).
 * Percentuais informados pelo cliente — usados no líquido do Caixa do dia.
 *
 * Débito Visa/Master 1,37% · Elo/Amex 2,58%
 * Crédito Visa/Master 1–4x · Elo/Amex 1–4x
 * PIX / dinheiro / demais: 0%
 */

export type CardBrand = "visa_master" | "elo_amex";

/** Percentual (ex.: 3.15 = 3,15%). */
const DEBIT_FEE_PCT: Record<CardBrand, number> = {
  visa_master: 1.37,
  elo_amex: 2.58,
};

/** Índice 1..4 = parcelas. */
const CREDIT_FEE_PCT: Record<CardBrand, Record<number, number>> = {
  visa_master: { 1: 3.15, 2: 5.39, 3: 6.12, 4: 6.85 },
  elo_amex: { 1: 4.91, 2: 6.47, 3: 7.2, 4: 7.92 },
};

function asBrand(raw: unknown): CardBrand | null {
  if (raw === "visa_master" || raw === "elo_amex") return raw;
  return null;
}

function creditInstallments(meta: Record<string, unknown> | null | undefined): number {
  const n = Number(meta?.installments);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(4, Math.max(1, Math.round(n)));
}

/**
 * Taxa % para um pagamento já persistido (method enum + meta.brand/installments).
 * Retorna 0 se não há taxa (PIX, dinheiro, conta cliente, etc.).
 */
export function paymentFeePercent(
  method: string,
  meta?: Record<string, unknown> | null
): number {
  const brand = asBrand(meta?.brand);
  if (method === "debit") {
    if (!brand) return DEBIT_FEE_PCT.visa_master;
    return DEBIT_FEE_PCT[brand];
  }
  if (method === "credit" || method === "infinity") {
    const n = creditInstallments(meta);
    const table = CREDIT_FEE_PCT[brand ?? "visa_master"];
    return table[n] ?? table[4] ?? 0;
  }
  return 0;
}

/** Centavos de taxa sobre o valor bruto do pagamento. */
export function paymentFeeCents(
  amountCents: number,
  method: string,
  meta?: Record<string, unknown> | null
): number {
  const amount = Math.max(0, Math.round(amountCents));
  if (amount <= 0) return 0;
  const pct = paymentFeePercent(method, meta);
  if (pct <= 0) return 0;
  return Math.round((amount * pct) / 100);
}

export function paymentNetCents(
  amountCents: number,
  method: string,
  meta?: Record<string, unknown> | null
): number {
  return Math.max(0, Math.round(amountCents) - paymentFeeCents(amountCents, method, meta));
}
