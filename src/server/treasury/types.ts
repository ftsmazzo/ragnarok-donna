/** Situação calculada do título (não persistida). */
export type FinanceSituation =
  | "settled"
  | "overdue"
  | "this_week"
  | "open"
  | "forecast";

export type FinanceDirection = "credit" | "debit";

export type FinanceRecurrence = "none" | "weekly" | "biweekly" | "monthly" | "bimonthly";

export type ChartAccountRow = {
  id: string;
  code: string;
  name: string;
  syntheticName: string | null;
  dfcGroup1: string | null;
  dfcGroup2: string | null;
  dreGroup1: string | null;
  dreGroup2: string | null;
  includeInFcd: boolean;
  includeInFcm: boolean;
  active: boolean;
};

export type BankAccountRow = {
  id: string;
  name: string;
  institution: string | null;
  accountType: string;
  bankCode: string | null;
  openingBalanceCents: number;
  openingBalanceDate: string | null;
  branchId: string | null;
  active: boolean;
};

export type TreasuryPaymentMethodRow = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  sortOrder: number;
};

export type CreditCardRow = {
  id: string;
  name: string;
  institution: string | null;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  active: boolean;
  usedCents: number;
  availableCents: number;
  nextInvoiceCents: number;
  openInvoiceId: string | null;
};

export type FinanceEntryRow = {
  id: string;
  direction: FinanceDirection;
  description: string;
  partyName: string | null;
  chartAccountId: string | null;
  chartAccountCode: string | null;
  chartAccountName: string | null;
  bankAccountId: string | null;
  bankAccountName: string | null;
  treasuryPaymentMethodId: string | null;
  paymentMethodName: string | null;
  creditCardId: string | null;
  cardInvoiceId: string | null;
  costCenter: string | null;
  docType: string | null;
  docNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  settledAt: string | null;
  forecastCents: number | null;
  budgetCents: number | null;
  actualCents: number | null;
  amountCents: number;
  installmentIndex: number | null;
  installmentTotal: number | null;
  recurrence: FinanceRecurrence;
  isForecastOnly: boolean;
  reconciledAt: string | null;
  branchId: string | null;
  situation: FinanceSituation;
  notes: string | null;
};

export type TreasuryPermissions = {
  canWrite: boolean;
};

export type ApArFilter = {
  from?: string;
  to?: string;
  dateField?: "due" | "issue";
  situation?: FinanceSituation | "all_open";
  branchId?: string;
  q?: string;
};
