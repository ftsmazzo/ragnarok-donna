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
  performedAt: Date | null;
};

export type OrderPaymentDetail = {
  id: string;
  method: string;
  amountCents: number;
  paidAt: Date;
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
};

export type CatalogService = {
  id: string;
  name: string;
  priceCents: number;
  commissionBps: number | null;
};

export type CatalogProduct = {
  id: string;
  name: string;
  priceCents: number;
  commissionBps: number | null;
};

export type CatalogStaff = {
  id: string;
  name: string;
  defaultCommissionBps: number | null;
};

export type OrderPermissions = {
  canWrite: boolean;
  canCancel: boolean;
};
