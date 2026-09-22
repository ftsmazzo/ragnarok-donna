import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { softDelete, timestamps } from "./enums";
import { tenants } from "./platform";
import { branches, clients } from "./shop";
import { orders, payments } from "./ops";

/** Crédito = entrada/receita · Débito = saída/despesa (espelho C/D da planilha). */
export const financeDirectionEnum = pgEnum("finance_direction", ["credit", "debit"]);

export const financeRecurrenceEnum = pgEnum("finance_recurrence", [
  "none",
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
]);

export const bankAccountTypeEnum = pgEnum("bank_account_type", [
  "checking",
  "savings",
  "internal",
  "other",
]);

/**
 * Plano de contas (APR) — hierarquia analítica/sintética + grupos DFC/DRE.
 * Separado do caixa de turno (cash_sessions).
 */
export const chartAccounts = pgTable(
  "chart_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    syntheticName: varchar("synthetic_name", { length: 200 }),
    dfcGroup1: varchar("dfc_group_1", { length: 120 }),
    dfcGroup2: varchar("dfc_group_2", { length: 120 }),
    dreGroup1: varchar("dre_group_1", { length: 120 }),
    dreGroup2: varchar("dre_group_2", { length: 120 }),
    includeInFcd: boolean("include_in_fcd").notNull().default(true),
    includeInFcm: boolean("include_in_fcm").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("chart_accounts_tenant_code_uidx").on(t.tenantId, t.code),
    index("chart_accounts_tenant_idx").on(t.tenantId),
  ]
);

/** Contas bancárias / instituições da tesouraria. */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    institution: varchar("institution", { length: 120 }),
    accountType: bankAccountTypeEnum("account_type").notNull().default("checking"),
    bankCode: varchar("bank_code", { length: 32 }),
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
    openingBalanceDate: date("opening_balance_date"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("bank_accounts_tenant_idx").on(t.tenantId)]
);

/** Meios de pagamento da tesouraria (editáveis; não misturar com payment_method do POS). */
export const treasuryPaymentMethods = pgTable(
  "treasury_payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    code: varchar("code", { length: 40 }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("treasury_pm_tenant_name_uidx").on(t.tenantId, t.name),
    index("treasury_pm_tenant_idx").on(t.tenantId),
  ]
);

/** Cartão de crédito (Onda 2). */
export const creditCards = pgTable(
  "credit_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    institution: varchar("institution", { length: 120 }),
    limitCents: integer("limit_cents").notNull().default(0),
    closingDay: integer("closing_day").notNull().default(1),
    dueDay: integer("due_day").notNull().default(10),
    active: boolean("active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("credit_cards_tenant_idx").on(t.tenantId)]
);

/** Fatura / ciclo de cartão. */
export const cardInvoices = pgTable(
  "card_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    creditCardId: uuid("credit_card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueDate: date("due_date").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"), // open | closed | paid
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("card_invoices_card_idx").on(t.creditCardId),
    index("card_invoices_tenant_idx").on(t.tenantId),
  ]
);

/**
 * Título / evento financeiro canônico (base_de_dados).
 * Situação é calculada em runtime a partir de dueDate + settledAt + hoje.
 */
export const financeEntries = pgTable(
  "finance_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    direction: financeDirectionEnum("direction").notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    partyName: varchar("party_name", { length: 200 }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    chartAccountId: uuid("chart_account_id").references(() => chartAccounts.id, {
      onDelete: "set null",
    }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    treasuryPaymentMethodId: uuid("treasury_payment_method_id").references(
      () => treasuryPaymentMethods.id,
      { onDelete: "set null" }
    ),
    creditCardId: uuid("credit_card_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    cardInvoiceId: uuid("card_invoice_id").references(() => cardInvoices.id, {
      onDelete: "set null",
    }),
    costCenter: varchar("cost_center", { length: 120 }),
    docType: varchar("doc_type", { length: 60 }),
    docNumber: varchar("doc_number", { length: 80 }),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    forecastCents: integer("forecast_cents"),
    budgetCents: integer("budget_cents"),
    actualCents: integer("actual_cents"),
    installmentIndex: integer("installment_index"),
    installmentTotal: integer("installment_total"),
    recurrence: financeRecurrenceEnum("recurrence").notNull().default("none"),
    parentEntryId: uuid("parent_entry_id"),
    isForecastOnly: boolean("is_forecast_only").notNull().default(false),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    notes: text("notes"),
    /** Import / ponte: chave externa idempotente. */
    externalSource: varchar("external_source", { length: 40 }),
    externalId: varchar("external_id", { length: 120 }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("finance_entries_tenant_due_idx").on(t.tenantId, t.dueDate),
    index("finance_entries_tenant_issue_idx").on(t.tenantId, t.issueDate),
    index("finance_entries_tenant_settle_idx").on(t.tenantId, t.settledAt),
    index("finance_entries_bank_idx").on(t.bankAccountId),
    index("finance_entries_chart_idx").on(t.chartAccountId),
    uniqueIndex("finance_entries_external_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);

/** Vínculo opcional com comanda/pagamento (ponte POS — Onda 5). */
export const financeEntryLinks = pgTable(
  "finance_entry_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    financeEntryId: uuid("finance_entry_id")
      .notNull()
      .references(() => financeEntries.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("finance_entry_links_payment_uidx").on(t.paymentId),
    index("finance_entry_links_entry_idx").on(t.financeEntryId),
  ]
);

/** Config da ponte POS → tesouraria (por tenant). */
export const treasuryBridgeSettings = pgTable("treasury_bridge_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" })
    .unique(),
  enabled: boolean("enabled").notNull().default(false),
  /** Métodos POS que geram título (JSON array de payment_method). */
  methodCodes: text("method_codes").notNull().default('["pix","cash","debit","credit","transfer"]'),
  defaultChartAccountCode: varchar("default_chart_account_code", { length: 32 }).default("121"),
  ...timestamps,
});
