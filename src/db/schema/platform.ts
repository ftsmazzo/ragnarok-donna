import {
  boolean,
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
import {
  memberRoleEnum,
  softDelete,
  tenantStatusEnum,
  timestamps,
} from "./enums";

/**
 * Conta SaaS (barbearia / rede).
 * Tudo operacional carrega tenant_id.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    planCode: varchar("plan_code", { length: 40 }).notNull().default("trial"),
    status: tenantStatusEnum("status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
    locale: varchar("locale", { length: 16 }).notNull().default("pt-BR"),
    currency: varchar("currency", { length: 8 }).notNull().default("BRL"),
    /** Features / limites / branding */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    stripeCustomerId: varchar("stripe_customer_id", { length: 120 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 120 }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("tenants_slug_uidx").on(t.slug)]
);

/** Usuário da plataforma (pode ter várias barbearias) */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 200 }).notNull(),
    passwordHash: text("password_hash"),
    phone: varchar("phone", { length: 32 }),
    avatarUrl: text("avatar_url"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("users_email_uidx").on(t.email)]
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("staff"),
    /** Unidade fixa (gerente/barbeiro). Null = todas (dono/admin). */
    branchId: uuid("branch_id"),
    /** Permissões finas opcionais */
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_uidx").on(t.tenantId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ]
);

/**
 * Catálogo de planos SaaS (control plane).
 * Entitlements: agent_whatsapp, max_staff, max_branches, ai_credits...
 */
export const plans = pgTable("plans", {
  code: varchar("code", { length: 40 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  priceCentsMonthly: integer("price_cents_monthly").notNull().default(0),
  entitlements: jsonb("entitlements")
    .$type<Record<string, boolean | number>>()
    .notNull()
    .default({}),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});
