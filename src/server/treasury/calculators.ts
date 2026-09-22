/**
 * Calculadoras portadas da lógica das planilhas Donna
 * (CAPITAL DE GIRO.xlsm + ponto_de_equilibrio).
 * Puros — sem I/O; UI chama e exibe.
 */

export type WorkingCapitalInput = {
  /** Estoque inicial (R$ cents) */
  inventoryCents: number;
  /** Prazo médio de recebimento (dias) */
  receivableDays: number;
  /** Prazo médio de pagamento (dias) */
  payableDays: number;
  /** Vendas mensais médias (cents) */
  monthlySalesCents: number;
  /** CMV / custo variável mensal (cents) */
  monthlyCogsCents: number;
  /** Despesas fixas mensais (cents) */
  monthlyFixedCents: number;
};

export type WorkingCapitalResult = {
  /** Contas a receber projetadas */
  receivablesCents: number;
  /** Contas a pagar projetadas */
  payablesCents: number;
  /** Necessidade de capital de giro */
  ncgCents: number;
  /** Capital de giro próprio sugerido (NCG + estoque) */
  workingCapitalCents: number;
  /** Cobertura em dias de despesa fixa */
  coverageDays: number;
};

export function calcWorkingCapital(input: WorkingCapitalInput): WorkingCapitalResult {
  const salesPerDay = input.monthlySalesCents / 30;
  const cogsPerDay = input.monthlyCogsCents / 30;
  const receivablesCents = Math.round(salesPerDay * input.receivableDays);
  const payablesCents = Math.round(cogsPerDay * input.payableDays);
  const ncgCents = receivablesCents + input.inventoryCents - payablesCents;
  const workingCapitalCents = ncgCents;
  const fixedPerDay = input.monthlyFixedCents / 30;
  const coverageDays =
    fixedPerDay > 0 ? Math.round((workingCapitalCents / fixedPerDay) * 10) / 10 : 0;
  return {
    receivablesCents,
    payablesCents,
    ncgCents,
    workingCapitalCents,
    coverageDays,
  };
}

export type BreakEvenInput = {
  /** Preço médio unitário / ticket (cents) */
  unitPriceCents: number;
  /** Custo variável unitário (cents) */
  variableCostCents: number;
  /** Custos fixos mensais (cents) */
  fixedCostsCents: number;
  /** Impostos % sobre receita (0–100) */
  taxPercent?: number;
};

export type BreakEvenResult = {
  contributionMarginCents: number;
  contributionMarginRatio: number;
  /** Unidades (tickets) para PE contábil */
  breakEvenUnits: number;
  /** Receita no PE contábil */
  breakEvenRevenueCents: number;
  /** PE econômico = contábil × 1.2 (margem de segurança simplificada da planilha) */
  economicBreakEvenRevenueCents: number;
  /** PE fiscal aproximado com impostos */
  fiscalBreakEvenRevenueCents: number;
};

export function calcBreakEven(input: BreakEvenInput): BreakEvenResult {
  const tax = Math.max(0, Math.min(100, input.taxPercent ?? 0)) / 100;
  const netPrice = Math.round(input.unitPriceCents * (1 - tax));
  const margin = netPrice - input.variableCostCents;
  const ratio = netPrice > 0 ? margin / netPrice : 0;
  const units = margin > 0 ? Math.ceil(input.fixedCostsCents / margin) : 0;
  const revenue = units * input.unitPriceCents;
  const economic = Math.round(revenue * 1.2);
  const fiscalMargin = input.unitPriceCents * (1 - tax) - input.variableCostCents;
  const fiscalUnits = fiscalMargin > 0 ? Math.ceil(input.fixedCostsCents / fiscalMargin) : 0;
  const fiscalRevenue = fiscalUnits * input.unitPriceCents;

  return {
    contributionMarginCents: margin,
    contributionMarginRatio: Math.round(ratio * 1000) / 1000,
    breakEvenUnits: units,
    breakEvenRevenueCents: revenue,
    economicBreakEvenRevenueCents: economic,
    fiscalBreakEvenRevenueCents: fiscalRevenue,
  };
}
