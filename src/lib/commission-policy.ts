/** Regras de comissão da casa (Daniel, 2026-09-21). */

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

/** Valor de 1 crédito = preço do pacote ÷ quantidade de serviços. */
export function packageCreditBaseCents(priceCents: number, serviceCount: number): number {
  const n = Math.max(1, serviceCount);
  return Math.round(Math.max(0, priceCents) / n);
}
