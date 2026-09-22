export type OrderStatus = "open" | "closed" | "cancelled";

export type OrderListItem = {
  id: string;
  externalId: string | null;
  clientId: string | null;
  clientName: string | null;
  openedAt: Date;
  closedAt: Date | null;
  totalCents: number;
  discountCents: number;
  status: OrderStatus;
  itemCount: number;
  paidCents: number;
  staffLabel: string | null;
};

export type OrderItemDetail = {
  id: string;
  itemType: string;
  description: string;
  qty: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  staffId: string | null;
  staffName: string | null;
  commissionBps: number | null;
  commissionCents: number | null;
  serviceId: string | null;
  productId: string | null;
  packageId: string | null;
  performedAt: Date | null;
  redeemed: boolean;
  /** Valor abatido pelo crédito de pacote (meta.coveredCents). */
  coveredCents: number;
  packageSale: boolean;
  walletPending: boolean;
  /** Item zerado como cortesia (meta.courtesy) — não entra no caixa. */
  courtesy: boolean;
};

export type OrderPaymentDetail = {
  id: string;
  method: string;
  amountCents: number;
  paidAt: Date;
  meta: Record<string, unknown> | null;
};

export type OrderDetail = {
  id: string;
  externalId: string | null;
  status: OrderStatus;
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
  openedAt: Date;
  closedAt: Date | null;
  totalCents: number;
  discountCents: number;
  notes: string | null;
  items: OrderItemDetail[];
  payments: OrderPaymentDetail[];
  paidCents: number;
  balanceCents: number;
  clientAccountDebtCents: number;
  /** Saldo da Conta do Cliente (crédito > 0, débito < 0). Null se sem cliente. */
  clientAccountBalanceCents: number | null;
  credits: import("../packages/credits").ClientCreditBalance[];
  /** Horários da série, quando a comanda nasceu de um agendamento recorrente. */
  series: { id: string; startsAt: Date; status: string }[];
};

export type CatalogService = {
  id: string;
  name: string;
  priceCents: number;
  commissionBps: number | null;
  durationMin: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  priceCents: number;
  commissionBps: number | null;
  stockQty?: number;
};

export type CatalogPackage = {
  id: string;
  name: string;
  priceCents: number;
  expiresAfterDays: number | null;
  itemLabel: string;
  /** Combo: entra na comanda já dividido, sem gerar carteira. */
  billAsLines?: boolean;
  items?: Array<{
    serviceId?: string;
    serviceName?: string;
    productId?: string;
    productName?: string;
    qty: number;
  }>;
};

export type CatalogStaff = {
  id: string;
  name: string;
  defaultCommissionBps: number | null;
};

export type OrderPermissions = {
  canWrite: boolean;
  canCancel: boolean;
  /** Titular/admin: reabrir comanda fechada pelo histórico. */
  canReopen: boolean;
};
