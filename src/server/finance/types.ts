export type CashSessionSummary = {
  id: string;
  openedAt: Date;
  closedAt: Date | null;
  openingCents: number;
  closingCents: number | null;
  notes: string | null;
  openedByName: string | null;
  closedByName: string | null;
  isOpen: boolean;
};

export type CashMovementRow = {
  id: string;
  createdAt: Date;
  direction: "in" | "out";
  method: string | null;
  amountCents: number;
  description: string | null;
  orderId: string | null;
  orderExternalId: string | null;
  clientName: string | null;
};

export type CashDaySnapshot = {
  date: string;
  session: CashSessionSummary | null;
  openSession: CashSessionSummary | null;
  movements: CashMovementRow[];
  expectedInCents: number;
  expectedOutCents: number;
  expectedBalanceCents: number;
  paymentTotalCents: number;
  /** Soma das taxas de adquirente sobre os pagamentos do dia. */
  paymentFeeCents: number;
  /** Bruto − taxas (líquido a receber das formas). */
  paymentNetCents: number;
  paymentCount: number;
  closedOrdersCount: number;
  closedOrdersCents: number;
  openOrdersCount: number;
  byMethod: { method: string; count: number; totalCents: number; feeCents: number; netCents: number }[];
  payments: {
    id: string;
    paidAt: Date;
    method: string;
    amountCents: number;
    clientName: string | null;
    orderExternalId: string | null;
    orderId: string;
    /** Venda de pacote sem uso — dá para estornar no balcão. */
    packageCancelId: string | null;
    /** Consumo profissional→profissional (não deveria pesar no caixa). */
    isStaffConsumption: boolean;
  }[];
};

export type CashPermissions = {
  canWrite: boolean;
};
