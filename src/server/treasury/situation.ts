import { todaySp, shiftDateSp } from "@/lib/datetime";
import type { FinanceSituation } from "./types";

/** Situação derivada de datas (America/Sao_Paulo). */
export function computeSituation(input: {
  dueDate: string | null;
  settledAt: Date | string | null;
  isForecastOnly?: boolean;
  actualCents?: number | null;
  today?: string;
}): FinanceSituation {
  if (input.settledAt) return "settled";
  if (input.isForecastOnly && !(input.actualCents && input.actualCents > 0)) {
    return "forecast";
  }
  const today = input.today ?? todaySp();
  if (!input.dueDate) return "open";
  if (input.dueDate < today) return "overdue";
  const weekEnd = shiftDateSp(today, 7);
  if (input.dueDate <= weekEnd) return "this_week";
  return "open";
}

export function operationalAmountCents(row: {
  actualCents?: number | null;
  forecastCents?: number | null;
  budgetCents?: number | null;
  settledAt?: Date | string | null;
}): number {
  if (row.settledAt && row.actualCents != null) return row.actualCents;
  if (row.actualCents != null && row.actualCents !== 0) return row.actualCents;
  if (row.forecastCents != null) return row.forecastCents;
  if (row.budgetCents != null) return row.budgetCents;
  return 0;
}

export const SITUATION_LABEL: Record<FinanceSituation, string> = {
  settled: "Realizado",
  overdue: "Atrasado",
  this_week: "Na semana",
  open: "Aberto",
  forecast: "Previsto",
};
