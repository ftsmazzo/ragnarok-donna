/** Regras legado de meta de extras (ranking). A % paga vem do serviço/produto no catálogo. */

export const SERVICE_BASE_BPS = 4000;
export const EXTRAS_BPS_AT_2000 = 4500;
export const EXTRAS_BPS_AT_2500 = 5000;
export const EXTRAS_GOAL_2000_CENTS = 200_000;
export const EXTRAS_GOAL_2500_CENTS = 250_000;

export type ServiceCommissionKind = "ordinary" | "extra";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Ordinário: corte, barba normal, recorrência, luzes.
 * Qualquer outro serviço é extra.
 */
export function classifyServiceCommission(
  name: string,
  category?: string | null
): ServiceCommissionKind {
  const text = fold(`${name} ${category ?? ""}`);
  if (text.includes("recorr")) return "ordinary";
  if (/\bluzes?\b/.test(text)) return "ordinary";
  if (
    /(pigment|hidrat|sobrancelh|massag|peeling|botox|progressiv|alisament|design|barboter|selagem)/.test(
      text
    )
  ) {
    return "extra";
  }
  if (/\bcorte\b/.test(text) || /\bbarba\b/.test(text)) return "ordinary";
  return "extra";
}

export function extrasCommissionBps(monthExtrasBaseCents: number): number {
  if (monthExtrasBaseCents >= EXTRAS_GOAL_2500_CENTS) return EXTRAS_BPS_AT_2500;
  if (monthExtrasBaseCents >= EXTRAS_GOAL_2000_CENTS) return EXTRAS_BPS_AT_2000;
  return SERVICE_BASE_BPS;
}

export function commissionCentsFrom(baseCents: number, bps: number): number {
  return Math.round((Math.max(0, baseCents) * bps) / 10000);
}

/**
 * Hierarquia AppBarber / áudios 23/09:
 * 1) override profissional × serviço (ou produto)
 * 2) % do catálogo
 * 3) fallback legado do profissional (só se catálogo vazio)
 * 4) null → sem comissão
 */
export function resolveCommissionBps(input: {
  overrideBps?: number | null;
  catalogBps?: number | null;
  staffDefaultBps?: number | null;
}): number | null {
  if (input.overrideBps != null && input.overrideBps >= 0) return input.overrideBps;
  if (input.catalogBps != null && input.catalogBps >= 0) return input.catalogBps;
  if (input.staffDefaultBps != null && input.staffDefaultBps >= 0) {
    return input.staffDefaultBps;
  }
  return null;
}

/** Base em centavos de uma linha de serviço extra. Ordinário devolve null. */
export function extraServiceBaseCents(input: {
  name: string;
  category?: string | null;
  totalCents: number;
  unitPriceCents: number;
  qty: number;
  commissionBps?: number | null;
  commissionCents?: number | null;
  meta?: unknown;
}): number | null {
  if (classifyServiceCommission(input.name, input.category) !== "extra") return null;
  const meta =
    input.meta && typeof input.meta === "object"
      ? (input.meta as Record<string, unknown>)
      : {};
  if (typeof meta.commissionBaseCents === "number" && meta.commissionBaseCents >= 0) {
    return meta.commissionBaseCents;
  }
  if (
    input.commissionBps != null &&
    input.commissionBps > 0 &&
    input.commissionCents != null &&
    input.commissionCents >= 0
  ) {
    return Math.round((input.commissionCents * 10000) / input.commissionBps);
  }
  if (input.totalCents > 0) return input.totalCents;
  return input.unitPriceCents * Math.max(1, input.qty);
}

/** Valor de 1 crédito = preço do pacote ÷ quantidade de serviços. */
export function packageCreditBaseCents(priceCents: number, serviceCount: number): number {
  const n = Math.max(1, serviceCount);
  return Math.round(Math.max(0, priceCents) / n);
}
