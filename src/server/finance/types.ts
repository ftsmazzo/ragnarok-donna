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
  paymentCount: number;
  closedOrdersCount: number;
  closedOrdersCents: number;
  openOrdersCount: number;
  byMethod: { method: string; count: number; totalCents: number }[];
  payments: {
    id: string;
    paidAt: Date;
    method: string;
    amountCents: number;
    clientName: string | null;
    orderExternalId: string | null;
  }[];
};

export type CashPermissions = {
  canWrite: boolean;
};
