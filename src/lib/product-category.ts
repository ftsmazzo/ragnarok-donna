/** Heurísticas de categoria de produto para escopos de estoque (Barbearia / Bar / Insumos). */

export type StockScope = "all" | "shop" | "bar" | "insumos";

export function isBarCategory(category: string | null | undefined): boolean {
  const c = (category ?? "").toLowerCase();
  return /\bbar\b|bebida|drink|cerveja|whisky|refrigerante|porção|petisco|destilado/.test(c);
}

/** Insumos operacionais (copos, lixo, lâminas…) — não confundir com produtos de venda da loja. */
export function isInsumoCategory(category: string | null | undefined): boolean {
  const c = (category ?? "").toLowerCase();
  if (/\binsumo/.test(c)) return true;
  return /\bcopo|descart|lixo|luva|papel|algod|l[âa]mina|navalha|touca|capinha|guardanapo|canudo|talher|embalag|saco\b|esponja|fita\b|desinf|alcool|álcool/.test(
    c
  );
}

export function matchesStockScope(
  category: string | null | undefined,
  scope: StockScope
): boolean {
  if (scope === "all") return true;
  const bar = isBarCategory(category);
  const insumos = isInsumoCategory(category);
  if (scope === "bar") return bar;
  if (scope === "insumos") return insumos && !bar;
  // shop = loja / barbearia (não bar, não insumos)
  return !bar && !insumos;
}

/** Qty sugerida a pedir para voltar ao mínimo (mínimo 0). */
export function qtyToOrder(stockQty: number, minQty: number): number {
  return Math.max(0, Math.ceil(minQty - stockQty));
}
