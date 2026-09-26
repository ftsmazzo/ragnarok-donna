/**
 * Taxas de adquirente (líquido do Caixa — só informativo).
 * Defaults = tabela Fred/Donna; cada tenant pode sobrescrever em settings.paymentFees.
 */

export type CardBrand = "visa_master" | "elo_amex";

export type PaymentFeesTable = {
  debit: Record<CardBrand, number>;
  credit: Record<CardBrand, Record<number, number>>;
};

/** Percentuais default (ex.: 3.15 = 3,15%). */
export const DEFAULT_PAYMENT_FEES: PaymentFeesTable = {
  debit: {
    visa_master: 1.37,
    elo_amex: 2.58,
  },
  credit: {
    visa_master: { 1: 3.15, 2: 5.39, 3: 6.12, 4: 6.85 },
    elo_amex: { 1: 4.91, 2: 6.47, 3: 7.2, 4: 7.92 },
  },
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

function clampPct(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(String(n ?? "").replace(",", "."));
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.min(100, Math.round(v * 100) / 100);
}

/** Normaliza JSON do tenant (parcial) com fallback nos defaults. */
export function normalizePaymentFees(raw: unknown): PaymentFeesTable {
  const base = DEFAULT_PAYMENT_FEES;
  if (!raw || typeof raw !== "object") return structuredClone(base);
  const o = raw as Record<string, unknown>;
  const debitRaw = (o.debit ?? {}) as Record<string, unknown>;
  const creditRaw = (o.credit ?? {}) as Record<string, unknown>;
  const vmCredit = (creditRaw.visa_master ?? {}) as Record<string, unknown>;
  const eaCredit = (creditRaw.elo_amex ?? {}) as Record<string, unknown>;

  return {
    debit: {
      visa_master: clampPct(debitRaw.visa_master, base.debit.visa_master),
      elo_amex: clampPct(debitRaw.elo_amex, base.debit.elo_amex),
    },
    credit: {
      visa_master: {
        1: clampPct(vmCredit["1"] ?? vmCredit[1], base.credit.visa_master[1]!),
        2: clampPct(vmCredit["2"] ?? vmCredit[2], base.credit.visa_master[2]!),
        3: clampPct(vmCredit["3"] ?? vmCredit[3], base.credit.visa_master[3]!),
        4: clampPct(vmCredit["4"] ?? vmCredit[4], base.credit.visa_master[4]!),
      },
      elo_amex: {
        1: clampPct(eaCredit["1"] ?? eaCredit[1], base.credit.elo_amex[1]!),
        2: clampPct(eaCredit["2"] ?? eaCredit[2], base.credit.elo_amex[2]!),
        3: clampPct(eaCredit["3"] ?? eaCredit[3], base.credit.elo_amex[3]!),
        4: clampPct(eaCredit["4"] ?? eaCredit[4], base.credit.elo_amex[4]!),
      },
    },
  };
}

export function paymentFeesFromTenantSettings(
  settings: Record<string, unknown> | null | undefined
): PaymentFeesTable {
  return normalizePaymentFees(settings?.paymentFees);
}

/**
 * Taxa % para um pagamento já persistido (method enum + meta.brand/installments).
 * Retorna 0 se não há taxa (PIX, dinheiro, conta cliente, etc.).
 */
export function paymentFeePercent(
  method: string,
  meta?: Record<string, unknown> | null,
  fees: PaymentFeesTable = DEFAULT_PAYMENT_FEES
): number {
  const brand = asBrand(meta?.brand);
  if (method === "debit") {
    if (!brand) return fees.debit.visa_master;
    return fees.debit[brand];
  }
  if (method === "credit" || method === "infinity") {
    const n = creditInstallments(meta);
    const table = fees.credit[brand ?? "visa_master"];
    return table[n] ?? table[4] ?? 0;
  }
  return 0;
}

/** Centavos de taxa sobre o valor bruto do pagamento. */
export function paymentFeeCents(
  amountCents: number,
  method: string,
  meta?: Record<string, unknown> | null,
  fees: PaymentFeesTable = DEFAULT_PAYMENT_FEES
): number {
  const amount = Math.max(0, Math.round(amountCents));
  if (amount <= 0) return 0;
  const pct = paymentFeePercent(method, meta, fees);
  if (pct <= 0) return 0;
  return Math.round((amount * pct) / 100);
}

export function paymentNetCents(
  amountCents: number,
  method: string,
  meta?: Record<string, unknown> | null,
  fees: PaymentFeesTable = DEFAULT_PAYMENT_FEES
): number {
  return Math.max(0, Math.round(amountCents) - paymentFeeCents(amountCents, method, meta, fees));
}
