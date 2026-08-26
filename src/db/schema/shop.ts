import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
  varchar,
  index,
  date,
} from "drizzle-orm/pg-core";
import { externalRef, softDelete, timestamps } from "./enums";
import { tenants } from "./platform";

/** Unidade / filial (ex.: Centro, Higienópolis) */
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 32 }),
    timezone: varchar("timezone", { length: 64 }),
    isActive: boolean("is_active").notNull().default(true),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("branches_tenant_slug_uidx").on(t.tenantId, t.slug),
    uniqueIndex("branches_tenant_ext_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);

/** Profissional / barbeiro */
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    userId: uuid("user_id"), // membership opcional
    name: varchar("name", { length: 160 }).notNull(),
    nickname: varchar("nickname", { length: 80 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 32 }),
    avatarUrl: text("avatar_url"),
    isBookable: boolean("is_bookable").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    color: varchar("color", { length: 16 }),
    defaultCommissionBps: integer("default_commission_bps"), // 4000 = 40%
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("staff_tenant_idx").on(t.tenantId),
    uniqueIndex("staff_tenant_ext_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);

/** Cliente final da barbearia */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 32 }),
    phoneE164: varchar("phone_e164", { length: 20 }),
    birthDate: date("birth_date"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    /** Preferências p/ agente (tom, profissional favorito…) */
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("clients_tenant_phone_idx").on(t.tenantId, t.phoneE164),
    index("clients_tenant_name_idx").on(t.tenantId, t.name),
    uniqueIndex("clients_tenant_ext_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...externalRef(),
    ...timestamps,
  },
  (t) => [uniqueIndex("service_categories_tenant_name_uidx").on(t.tenantId, t.name)]
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => serviceCategories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull().default(30),
    priceCents: integer("price_cents").notNull().default(0),
    commissionBps: integer("commission_bps"),
    isActive: boolean("is_active").notNull().default(true),
    bookableOnline: boolean("bookable_online").notNull().default(true),
    /** Retorno automático em X dias (mensagem agente) */
    returnAfterDays: integer("return_after_days"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("services_tenant_idx").on(t.tenantId),
    uniqueIndex("services_tenant_ext_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);

/** Quem executa qual serviço */
export const staffServices = pgTable(
  "staff_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    customPriceCents: integer("custom_price_cents"),
    customDurationMin: integer("custom_duration_min"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("staff_services_uidx").on(t.staffId, t.serviceId),
  ]
);

/** Jornada semanal do profissional (0=dom … 6=sáb) */
export const staffSchedules = pgTable(
  "staff_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    weekday: integer("weekday").notNull(), // 0-6
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    slotIndex: integer("slot_index").notNull().default(1), // turno 1/2/3
    isActive: boolean("is_active").notNull().default(true),
    ...externalRef(),
    ...timestamps,
  },
  (t) => [index("staff_schedules_staff_weekday_idx").on(t.staffId, t.weekday)]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    category: varchar("category", { length: 80 }),
    brand: varchar("brand", { length: 80 }),
    sku: varchar("sku", { length: 80 }),
    priceCents: integer("price_cents").notNull().default(0),
    costCents: integer("cost_cents"),
    stockQty: integer("stock_qty").notNull().default(0),
    minQty: integer("min_qty").notNull().default(0),
    forSale: boolean("for_sale").notNull().default(true),
    forInternalUse: boolean("for_internal_use").notNull().default(false),
    commissionBps: integer("commission_bps"),
    isActive: boolean("is_active").notNull().default(true),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("products_tenant_idx").on(t.tenantId),
    uniqueIndex("products_tenant_ext_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);

export const packages = pgTable(
  "packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull().default(0),
    expiresAfterDays: integer("expires_after_days"),
    isActive: boolean("is_active").notNull().default(true),
    bookableOnline: boolean("bookable_online").notNull().default(true),
    items: jsonb("items")
      .$type<Array<{ serviceId?: string; productId?: string; qty: number }>>()
      .notNull()
      .default([]),
    ...externalRef(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("packages_tenant_ext_uidx").on(t.tenantId, t.externalSource, t.externalId),
  ]
);
