/** Consumo do profissional = preço de venda − 30% (cobra 70%). */
export const STAFF_CONSUMPTION_PRICE_FACTOR = 0.7;

export function staffConsumptionAmountCents(salePriceCents: number, qty = 1): number {
  return Math.max(1, Math.round(salePriceCents * STAFF_CONSUMPTION_PRICE_FACTOR * qty));
}
