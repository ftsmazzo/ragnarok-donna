import {
  and,
  asc,
  count,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { schema } from "@/db";
import { dayBoundsSp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";
import { resolveBranchScope, withBranchScope } from "@/server/context/branch-scope";

export const PAGE_SIZE = 50;

export type ClientFilter = "ativos" | "removidos" | "todos";

export type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  deletedAt: Date | null;
};

// listClients movido para @/server/clients (Sprint 1)

export type StaffRow = {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  color: string | null;
  isBookable: boolean;
  isActive: boolean;
  defaultCommissionBps: number | null;
  scheduleSlots: number;
};

export type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  sku: string | null;
  priceCents: number;
  stockQty: number;
  minQty: number;
  forSale: boolean;
  isActive: boolean;
};

export type ServiceRow = {
  id: string;
  name: string;
  categoryName: string | null;
  durationMin: number;
  priceCents: number;
  commissionBps: number | null;
  isActive: boolean;
  bookableOnline: boolean;
};

export type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  itemCount: number;
  isActive: boolean;
  bookableOnline: boolean;
};

export type TenantOverview = {
  tenantName: string;
  clients: number;
  clientsActive: number;
  staff: number;
  services: number;
  products: number;
  packages: number;
  appointmentsToday: number;
  waitlist: number;
  openOrdersToday: number;
};

export async function listStaff() {
  const tenant = await getDefaultTenant();
  const scope = await resolveBranchScope();
  const db = getDb();

  if (scope.isInactiveBranch) {
    return { rows: [], total: 0 };
  }

  const rows = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      nickname: schema.staff.nickname,
      phone: schema.staff.phone,
      email: schema.staff.email,
      avatarUrl: schema.staff.avatarUrl,
      color: schema.staff.color,
      isBookable: schema.staff.isBookable,
      isActive: schema.staff.isActive,
      defaultCommissionBps: schema.staff.defaultCommissionBps,
      scheduleSlots: sql<number>`(
        select count(*)::int from ${schema.staffSchedules}
        where ${schema.staffSchedules.staffId} = ${schema.staff.id}
          and ${schema.staffSchedules.isActive} = true
      )`.as("schedule_slots"),
    })
    .from(schema.staff)
    .where(
      withBranchScope(
        scope,
        schema.staff.branchId,
        and(eq(schema.staff.tenantId, tenant.id), isNull(schema.staff.deletedAt))
      )
    )
    .orderBy(asc(schema.staff.name));

  return { rows, total: rows.length };
}

export async function listProducts(opts: { q?: string }) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const q = opts.q?.trim();

  let where = and(
    eq(schema.products.tenantId, tenant.id),
    isNull(schema.products.deletedAt)
  );
  if (q) {
    where = and(
      where,
      or(
        ilike(schema.products.name, `%${q}%`),
        ilike(schema.products.category, `%${q}%`),
        ilike(schema.products.brand, `%${q}%`),
        ilike(schema.products.sku, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      category: schema.products.category,
      brand: schema.products.brand,
      sku: schema.products.sku,
      priceCents: schema.products.priceCents,
      stockQty: schema.products.stockQty,
      minQty: schema.products.minQty,
      forSale: schema.products.forSale,
      isActive: schema.products.isActive,
    })
    .from(schema.products)
    .where(where)
    .orderBy(asc(schema.products.name));

  return { rows, total: rows.length, q: q ?? "" };
}

export async function listServices(opts: { q?: string }) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const q = opts.q?.trim();

  let where = and(
    eq(schema.services.tenantId, tenant.id),
    isNull(schema.services.deletedAt)
  );
  if (q) {
    where = and(where, ilike(schema.services.name, `%${q}%`));
  }

  const rows = await db
    .select({
      id: schema.services.id,
      name: schema.services.name,
      categoryName: schema.serviceCategories.name,
      durationMin: schema.services.durationMin,
      priceCents: schema.services.priceCents,
      commissionBps: schema.services.commissionBps,
      isActive: schema.services.isActive,
      bookableOnline: schema.services.bookableOnline,
    })
    .from(schema.services)
    .leftJoin(
      schema.serviceCategories,
      eq(schema.services.categoryId, schema.serviceCategories.id)
    )
    .where(where)
    .orderBy(asc(schema.serviceCategories.sortOrder), asc(schema.services.name));

  return { rows, total: rows.length, q: q ?? "" };
}

export async function listPackages(opts: { q?: string }) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const q = opts.q?.trim();

  let where = and(
    eq(schema.packages.tenantId, tenant.id),
    isNull(schema.packages.deletedAt)
  );
  if (q) {
    where = and(where, ilike(schema.packages.name, `%${q}%`));
  }

  const rows = await db
    .select({
      id: schema.packages.id,
      name: schema.packages.name,
      description: schema.packages.description,
      priceCents: schema.packages.priceCents,
      itemCount: sql<number>`coalesce(jsonb_array_length(${schema.packages.items}), 0)::int`.as(
        "item_count"
      ),
      isActive: schema.packages.isActive,
      bookableOnline: schema.packages.bookableOnline,
    })
    .from(schema.packages)
    .where(where)
    .orderBy(asc(schema.packages.name));

  return { rows, total: rows.length, q: q ?? "" };
}

export async function getTenantOverview(): Promise<TenantOverview> {
  const tenant = await getDefaultTenant();
  const scope = await resolveBranchScope();
  const db = getDb();
  const { start, end } = dayBoundsSp();

  if (scope.isInactiveBranch) {
    return {
      tenantName: tenant.name,
      clients: 0,
      clientsActive: 0,
      staff: 0,
      services: 0,
      products: 0,
      packages: 0,
      appointmentsToday: 0,
      waitlist: 0,
      openOrdersToday: 0,
    };
  }

  const staffWhere = withBranchScope(
    scope,
    schema.staff.branchId,
    and(eq(schema.staff.tenantId, tenant.id), isNull(schema.staff.deletedAt))
  );
  const apptWhere = withBranchScope(
    scope,
    schema.appointments.branchId,
    and(
      eq(schema.appointments.tenantId, tenant.id),
      gte(schema.appointments.startsAt, start),
      lte(schema.appointments.startsAt, end),
      isNull(schema.appointments.deletedAt)
    )
  );
  const ordersWhere = withBranchScope(
    scope,
    schema.orders.branchId,
    and(
      eq(schema.orders.tenantId, tenant.id),
      eq(schema.orders.status, "open"),
      gte(schema.orders.openedAt, start),
      lte(schema.orders.openedAt, end),
      isNull(schema.orders.deletedAt)
    )
  );

  const [[clients], [clientsActive], [staff], [services], [products], [packages], [apptToday], [waitlist], [openOrders]] =
    await Promise.all([
      db
        .select({ n: count() })
        .from(schema.clients)
        .where(eq(schema.clients.tenantId, tenant.id)),
      db
        .select({ n: count() })
        .from(schema.clients)
        .where(
          and(
            eq(schema.clients.tenantId, tenant.id),
            eq(schema.clients.isActive, true),
            isNull(schema.clients.deletedAt)
          )
        ),
      db.select({ n: count() }).from(schema.staff).where(staffWhere),
      db
        .select({ n: count() })
        .from(schema.services)
        .where(and(eq(schema.services.tenantId, tenant.id), isNull(schema.services.deletedAt))),
      db
        .select({ n: count() })
        .from(schema.products)
        .where(and(eq(schema.products.tenantId, tenant.id), isNull(schema.products.deletedAt))),
      db
        .select({ n: count() })
        .from(schema.packages)
        .where(and(eq(schema.packages.tenantId, tenant.id), isNull(schema.packages.deletedAt))),
      db.select({ n: count() }).from(schema.appointments).where(apptWhere),
      scope.multiBranch
        ? db
            .select({ n: count() })
            .from(schema.waitlistEntries)
            .innerJoin(schema.staff, eq(schema.waitlistEntries.staffId, schema.staff.id))
            .where(
              and(
                eq(schema.waitlistEntries.tenantId, tenant.id),
                eq(schema.waitlistEntries.status, "waiting"),
                withBranchScope(scope, schema.staff.branchId)
              )
            )
        : db
            .select({ n: count() })
            .from(schema.waitlistEntries)
            .where(
              and(
                eq(schema.waitlistEntries.tenantId, tenant.id),
                eq(schema.waitlistEntries.status, "waiting")
              )
            ),
      db.select({ n: count() }).from(schema.orders).where(ordersWhere),
    ]);

  return {
    tenantName: tenant.name,
    clients: Number(clients?.n ?? 0),
    clientsActive: Number(clientsActive?.n ?? 0),
    staff: Number(staff?.n ?? 0),
    services: Number(services?.n ?? 0),
    products: Number(products?.n ?? 0),
    packages: Number(packages?.n ?? 0),
    appointmentsToday: Number(apptToday?.n ?? 0),
    waitlist: Number(waitlist?.n ?? 0),
    openOrdersToday: Number(openOrders?.n ?? 0),
  };
}
