import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  appointmentStatusEnum,
  externalRef,
  orderItemTypeEnum,
  orderStatusEnum,
  paymentMethodEnum,
  softDelete,
  staffAdvanceKindEnum,
  staffAdvanceStatusEnum,
  timestamps,
} from "./enums";
import { tenants } from "./platform";
import { branches, clients, packages, products, services, staff } from "./shop";

/**
 * Agendamento — fonte da verdade de slots (agente consulta/escreve aqui).
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatusEnum("status").notNull().default("scheduled"),
    priceCents: integer("price_cents"),
    notes: text("notes"),
    /** Origem: app, whatsapp_ai, painel, import */
    source: varchar("source", { length: 40 }).notNull().default("painel"),
    isEncaixe: boolean("is_encaixe").notNull().default(false),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    orderId: uuid("order_id"), // preenchido quando gera comanda
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("appointments_tenant_starts_idx").on(t.tenantId, t.startsAt),
    index("appointments_staff_starts_idx").on(t.staffId, t.startsAt),
    index("appointments_client_idx").on(t.clientId),
    uniqueIndex("appointments_tenant_ext_uidx").on(
      t.tenantId,
      t.externalSource,
      t.externalId
    ),
  ]
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    phone: varchar("phone", { length: 32 }),
    desiredDate: timestamp("desired_date", { withTimezone: true }),
    status: varchar("status", { length: 32 }).notNull().default("waiting"),
    notes: text("notes"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    ...externalRef(),
    ...timestamps,
  },
  (t) => [index("waitlist_tenant_status_idx").on(t.tenantId, t.status)]
);

/**
 * Comanda / ticket de consumo.
 * Histórico do cliente = orders + order_items.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    status: orderStatusEnum("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    totalCents: integer("total_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    notes: text("notes"),
    openedByUserId: uuid("opened_by_user_id"),
    closedByUserId: uuid("closed_by_user_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("orders_tenant_opened_idx").on(t.tenantId, t.openedAt),
    index("orders_client_idx").on(t.clientId),
    uniqueIndex("orders_tenant_ext_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    itemType: orderItemTypeEnum("item_type").notNull(),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    packageId: uuid("package_id"),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    description: varchar("description", { length: 200 }).notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    commissionBps: integer("commission_bps"),
    commissionCents: integer("commission_cents"),
    performedAt: timestamp("performed_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...externalRef(),
    ...timestamps,
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_staff_idx").on(t.staffId),
    uniqueIndex("order_items_tenant_ext_uidx").on(
      t.tenantId,
      t.externalSource,
      t.externalId
    ),
  ]
);

/**
 * Pacote vendido a um cliente (carteira).
 * Créditos por serviço ficam em client_package_credits.
 */
export const clientPackages = pgTable(
  "client_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    packageId: uuid("package_id").references(() => packages.id, { onDelete: "set null" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    orderItemId: uuid("order_item_id"),
    name: varchar("name", { length: 160 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("client_packages_client_idx").on(t.tenantId, t.clientId),
    index("client_packages_status_idx").on(t.tenantId, t.status),
  ]
);

export const clientPackageCredits = pgTable(
  "client_package_credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientPackageId: uuid("client_package_id")
      .notNull()
      .references(() => clientPackages.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    totalQty: integer("total_qty").notNull().default(1),
    remainingQty: integer("remaining_qty").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("client_package_credits_pkg_idx").on(t.clientPackageId),
    index("client_package_credits_service_idx").on(t.tenantId, t.serviceId),
    index("client_package_credits_product_idx").on(t.tenantId, t.productId),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...externalRef(),
    ...timestamps,
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    check("payments_amount_positive_chk", sql`${t.amountCents} > 0`),
  ]
);

/** Caixa do dia */
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    openedByUserId: uuid("opened_by_user_id"),
    closedByUserId: uuid("closed_by_user_id"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openingCents: integer("opening_cents").notNull().default(0),
    closingCents: integer("closing_cents"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("cash_sessions_tenant_opened_idx").on(t.tenantId, t.openedAt)]
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cashSessionId: uuid("cash_session_id")
      .notNull()
      .references(() => cashSessions.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    direction: varchar("direction", { length: 16 }).notNull(), // in | out
    method: paymentMethodEnum("method"),
    amountCents: integer("amount_cents").notNull(),
    description: varchar("description", { length: 200 }),
    ...timestamps,
  },
  (t) => [index("cash_movements_session_idx").on(t.cashSessionId)]
);

/** Ledger de fidelidade (auditoria; saldo em clients.loyalty_points) */
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: varchar("reason", { length: 120 }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    ...externalRef(),
    ...timestamps,
  },
  (t) => [index("loyalty_ledger_client_idx").on(t.clientId)]
);

/**
 * Extrato da Conta do Cliente (crédito/débito em dinheiro).
 * `delta_cents` > 0 = crédito; < 0 = débito. Saldo em clients.account_balance_cents.
 */
export const clientAccountLedger = pgTable(
  "client_account_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    deltaCents: integer("delta_cents").notNull(),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    notes: varchar("notes", { length: 240 }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("client_account_ledger_client_idx").on(t.tenantId, t.clientId),
    index("client_account_ledger_created_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("client_account_ledger_payment_uidx").on(t.paymentId),
    check("client_account_ledger_delta_nonzero_chk", sql`${t.deltaCents} <> 0`),
  ]
);

/**
 * Movimentações de estoque (entrada/saída).
 * `delta_qty` > 0 entrada; < 0 saída. Saldo em products.stock_qty.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    deltaQty: integer("delta_qty").notNull(),
    qtyAfter: integer("qty_after").notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    notes: varchar("notes", { length: 240 }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("stock_movements_product_idx").on(t.tenantId, t.productId),
    index("stock_movements_created_idx").on(t.tenantId, t.createdAt),
    check("stock_movements_delta_nonzero_chk", sql`${t.deltaQty} <> 0`),
  ]
);

/**
 * Vales, bônus, descontos e liquidações de comissão do profissional.
 * amount_cents sempre positivo; o efeito no “a pagar” depende de kind.
 */
export const staffAdvances = pgTable(
  "staff_advances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    kind: staffAdvanceKindEnum("kind").notNull(),
    status: staffAdvanceStatusEnum("status").notNull().default("open"),
    amountCents: integer("amount_cents").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    notes: varchar("notes", { length: 240 }),
    cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("staff_advances_tenant_staff_idx").on(t.tenantId, t.staffId),
    index("staff_advances_tenant_occurred_idx").on(t.tenantId, t.occurredAt),
  ]
);

/**
 * Assinatura mensal do cliente (além de pacote de créditos).
 * Sem cobrança Stripe nesta espinha — status operacional no painel.
 */
export const clientSubscriptions = pgTable(
  "client_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    /** active | late | cancelled */
    status: varchar("status", { length: 24 }).notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    /** Fim do período pago atual (renovação mensal manual por enquanto). */
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("client_subscriptions_client_idx").on(t.tenantId, t.clientId),
    index("client_subscriptions_status_idx").on(t.tenantId, t.status),
  ]
);
