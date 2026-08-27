import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { schema } from "@/db";
import { monthStartSp, rangeBoundsSp, todaySp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";
import { PAGE_SIZE } from "./cadastros";

function isBarCategory(category: string | null | undefined): boolean {
  const c = (category ?? "").toLowerCase();
  return /\bbar\b|bebida|drink|cerveja|whisky|refrigerante|porção|petisco|destilado/.test(c);
}

export type ApptReportRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  clientName: string | null;
  staffName: string | null;
  serviceName: string | null;
  priceCents: number | null;
  isEncaixe: boolean;
};

export type FinancialByMethod = {
  method: string;
  count: number;
  totalCents: number;
};

export async function reportAppointments(opts: {
  from?: string;
  to?: string;
  status?: string;
  q?: string;
  page?: number;
  /** Para export CSV (máx. 2000). */
  pageSize?: number;
}) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const from = opts.from ?? monthStartSp();
  const to = opts.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(2000, Math.max(1, opts.pageSize ?? PAGE_SIZE));
  const q = opts.q?.trim();
  const status = opts.status?.trim();

  let where = and(
    eq(schema.appointments.tenantId, tenant.id),
    gte(schema.appointments.startsAt, start),
    lte(schema.appointments.startsAt, end),
    isNull(schema.appointments.deletedAt)
  );

  if (status && status !== "all") {
    where = and(where, eq(schema.appointments.status, status as "scheduled"));
  }

  if (q) {
    where = and(
      where,
      or(
        ilike(schema.clients.name, `%${q}%`),
        ilike(schema.staff.name, `%${q}%`),
        ilike(schema.services.name, `%${q}%`)
      )
    );
  }

  const statusCounts = await db
    .select({
      status: schema.appointments.status,
      n: count(),
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, tenant.id),
        gte(schema.appointments.startsAt, start),
        lte(schema.appointments.startsAt, end),
        isNull(schema.appointments.deletedAt)
      )
    )
    .groupBy(schema.appointments.status);

  const [totalRow] = await db
    .select({ n: count() })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .where(where);

  const rows = await db
    .select({
      id: schema.appointments.id,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
      status: schema.appointments.status,
      clientName: schema.clients.name,
      staffName: schema.staff.name,
      serviceName: schema.services.name,
      priceCents: schema.appointments.priceCents,
      isEncaixe: schema.appointments.isEncaixe,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .where(where)
    .orderBy(desc(schema.appointments.startsAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const total = Number(totalRow?.n ?? 0);
  const byStatus = Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.n)]));

  const hourRows = await db
    .select({
      hour: sql<number>`extract(hour from (${schema.appointments.startsAt} at time zone 'America/Sao_Paulo'))::int`,
      n: count(),
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, tenant.id),
        gte(schema.appointments.startsAt, start),
        lte(schema.appointments.startsAt, end),
        isNull(schema.appointments.deletedAt),
        sql`${schema.appointments.status} <> 'blocked'`
      )
    )
    .groupBy(
      sql`extract(hour from (${schema.appointments.startsAt} at time zone 'America/Sao_Paulo'))::int`
    );

  const hourMap = Object.fromEntries(hourRows.map((r) => [Number(r.hour), Number(r.n)]));
  const hourHeatmap = Array.from({ length: 12 }, (_, i) => {
    const hour = i + 8; // 08–19
    return { hour, count: Number(hourMap[hour] ?? 0) };
  });

  return {
    rows: rows as ApptReportRow[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    from,
    to,
    status: status ?? "all",
    q: q ?? "",
    byStatus,
    hourHeatmap,
  };
}

export async function reportFinancial(opts: { from?: string; to?: string }) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const from = opts.from ?? monthStartSp();
  const to = opts.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);

  const byMethod = await db
    .select({
      method: schema.payments.method,
      n: count(),
      totalCents: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, tenant.id),
        gte(schema.payments.paidAt, start),
        lte(schema.payments.paidAt, end)
      )
    )
    .groupBy(schema.payments.method)
    .orderBy(desc(sql`sum(${schema.payments.amountCents})`));

  const [closedOrders] = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "closed"),
        gte(schema.orders.closedAt, start),
        lte(schema.orders.closedAt, end),
        isNull(schema.orders.deletedAt)
      )
    );

  const [openOrders] = await db
    .select({ n: count() })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt)
      )
    );

  const byItemType = await db
    .select({
      itemType: schema.orderItems.itemType,
      n: count(),
      totalCents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenant.id),
        eq(schema.orders.status, "closed"),
        gte(schema.orders.closedAt, start),
        lte(schema.orders.closedAt, end),
        isNull(schema.orders.deletedAt)
      )
    )
    .groupBy(schema.orderItems.itemType);

  const byStaff = await db
    .select({
      staffId: schema.orderItems.staffId,
      staffName: schema.staff.name,
      n: count(),
      totalCents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenant.id),
        eq(schema.orders.status, "closed"),
        gte(schema.orders.closedAt, start),
        lte(schema.orders.closedAt, end),
        isNull(schema.orders.deletedAt)
      )
    )
    .groupBy(schema.orderItems.staffId, schema.staff.name)
    .orderBy(desc(sql`sum(${schema.orderItems.totalCents})`))
    .limit(12);

  const totalPayments = byMethod.reduce((s, r) => s + Number(r.totalCents), 0);
  const totalPaymentsCount = byMethod.reduce((s, r) => s + Number(r.n), 0);
  const closedN = Number(closedOrders?.n ?? 0);
  const closedCents = Number(closedOrders?.total ?? 0);
  const ticketAvgCents = closedN > 0 ? Math.round(closedCents / closedN) : 0;

  const servicesCents = Number(
    byItemType.find((r) => r.itemType === "service")?.totalCents ?? 0
  );
  const productsCents = Number(
    byItemType.find((r) => r.itemType === "product")?.totalCents ?? 0
  );

  return {
    from,
    to,
    totalPaymentsCents: totalPayments,
    totalPaymentsCount,
    closedOrdersCount: closedN,
    closedOrdersCents: closedCents,
    openOrdersCount: Number(openOrders?.n ?? 0),
    ticketAvgCents,
    servicesCents,
    productsCents,
    byMethod: byMethod.map((r) => ({
      method: r.method,
      count: Number(r.n),
      totalCents: Number(r.totalCents),
    })) as FinancialByMethod[],
    byStaff: byStaff.map((r) => ({
      staffId: r.staffId,
      staffName: r.staffName ?? "Sem profissional",
      count: Number(r.n),
      totalCents: Number(r.totalCents),
    })),
  };
}

export async function reportOrders(opts: {
  from?: string;
  to?: string;
  status?: string;
  page?: number;
}) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const from = opts.from ?? monthStartSp();
  const to = opts.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const page = Math.max(1, opts.page ?? 1);
  const status = opts.status?.trim() ?? "all";

  let where = and(
    eq(schema.orders.tenantId, tenant.id),
    gte(schema.orders.openedAt, start),
    lte(schema.orders.openedAt, end),
    isNull(schema.orders.deletedAt)
  );

  if (status !== "all") {
    where = and(where, eq(schema.orders.status, status as "open"));
  }

  const [summary] = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .where(where);

  const [itemsSummary] = await db
    .select({ n: count() })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(where);

  const [openTime] = await db
    .select({
      avgMin: sql<number>`coalesce(avg(extract(epoch from (${schema.orders.closedAt} - ${schema.orders.openedAt})) / 60.0), 0)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "closed"),
        gte(schema.orders.openedAt, start),
        lte(schema.orders.openedAt, end),
        isNull(schema.orders.deletedAt),
        sql`${schema.orders.closedAt} is not null`
      )
    );

  const rows = await db
    .select({
      id: schema.orders.id,
      externalId: schema.orders.externalId,
      clientName: schema.clients.name,
      openedAt: schema.orders.openedAt,
      closedAt: schema.orders.closedAt,
      totalCents: schema.orders.totalCents,
      status: schema.orders.status,
      itemCount: sql<number>`(
        select count(*)::int from ${schema.orderItems}
        where ${schema.orderItems.orderId} = ${schema.orders.id}
      )`.as("item_count"),
      profissional: sql<string | null>`${schema.orders.meta}->>'profissional'`.as("profissional"),
    })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where)
    .orderBy(desc(schema.orders.openedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const total = Number(summary?.n ?? 0);

  const statusCounts = await db
    .select({
      status: schema.orders.status,
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        gte(schema.orders.openedAt, start),
        lte(schema.orders.openedAt, end),
        isNull(schema.orders.deletedAt)
      )
    )
    .groupBy(schema.orders.status);

  const byStatus = Object.fromEntries(
    statusCounts.map((r) => [r.status, { n: Number(r.n), totalCents: Number(r.total) }])
  );

  return {
    rows,
    total,
    totalCents: Number(summary?.total ?? 0),
    itemCount: Number(itemsSummary?.n ?? 0),
    avgItemsPerOrder: total > 0 ? Math.round((Number(itemsSummary?.n ?? 0) / total) * 10) / 10 : 0,
    avgOpenMinutes: Number(openTime?.avgMin ?? 0),
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    from,
    to,
    status,
    byStatus,
  };
}

export async function reportStock(opts?: {
  q?: string;
  onlyLow?: boolean;
  from?: string;
  to?: string;
  scope?: "all" | "shop" | "bar";
}) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const from = opts?.from ?? monthStartSp();
  const to = opts?.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const q = opts?.q?.trim();
  const onlyLow = Boolean(opts?.onlyLow);
  const scope = opts?.scope ?? "all";

  let where = and(
    eq(schema.products.tenantId, tenant.id),
    isNull(schema.products.deletedAt),
    eq(schema.products.isActive, true)
  );

  if (q) {
    where = and(
      where,
      or(
        ilike(schema.products.name, `%${q}%`),
        ilike(schema.products.category, `%${q}%`),
        ilike(schema.products.brand, `%${q}%`)
      )
    );
  }

  if (onlyLow) {
    where = and(where, sql`${schema.products.stockQty} <= ${schema.products.minQty}`);
  }

  const allRows = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      category: schema.products.category,
      brand: schema.products.brand,
      stockQty: schema.products.stockQty,
      minQty: schema.products.minQty,
      priceCents: schema.products.priceCents,
      forSale: schema.products.forSale,
    })
    .from(schema.products)
    .where(where)
    .orderBy(asc(schema.products.name));

  const rows = allRows.filter((r) => {
    if (scope === "bar") return isBarCategory(r.category);
    if (scope === "shop") return !isBarCategory(r.category);
    return true;
  });

  const lowInScope = rows.filter((r) => r.stockQty <= r.minQty).length;
  const zeroInScope = rows.filter((r) => r.stockQty <= 0).length;
  const valueInScope = rows.reduce((acc, r) => acc + r.stockQty * r.priceCents, 0);

  const [totals] = await db
    .select({
      n: count(),
      low: sql<number>`count(*) filter (where ${schema.products.stockQty} <= ${schema.products.minQty})::int`,
      zero: sql<number>`count(*) filter (where ${schema.products.stockQty} <= 0)::int`,
      value: sql<number>`coalesce(sum(${schema.products.stockQty} * ${schema.products.priceCents}), 0)::int`,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.tenantId, tenant.id),
        isNull(schema.products.deletedAt),
        eq(schema.products.isActive, true)
      )
    );

  const byCategory = await db
    .select({
      name: sql<string>`coalesce(nullif(${schema.products.category}, ''), 'Sem categoria')`,
      n: count(),
      stock: sql<number>`coalesce(sum(${schema.products.stockQty}), 0)::int`,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.tenantId, tenant.id),
        isNull(schema.products.deletedAt),
        eq(schema.products.isActive, true)
      )
    )
    .groupBy(sql`coalesce(nullif(${schema.products.category}, ''), 'Sem categoria')`)
    .orderBy(desc(sql`sum(${schema.products.stockQty})`))
    .limit(8);

  const soldRows = await db
    .select({
      name: schema.orderItems.description,
      qty: sql<number>`coalesce(sum(${schema.orderItems.qty}), 0)::int`,
      total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenant.id),
        eq(schema.orderItems.itemType, "product"),
        eq(schema.orders.status, "closed"),
        gte(schema.orders.closedAt, start),
        lte(schema.orders.closedAt, end),
        isNull(schema.orders.deletedAt)
      )
    )
    .groupBy(schema.orderItems.description)
    .orderBy(desc(sql`sum(${schema.orderItems.totalCents})`))
    .limit(8);

  return {
    from,
    to,
    q: q ?? "",
    onlyLow,
    scope,
    rows,
    skuCount: scope === "all" ? Number(totals?.n ?? 0) : rows.length,
    lowStockCount: scope === "all" ? Number(totals?.low ?? 0) : lowInScope,
    zeroStockCount: scope === "all" ? Number(totals?.zero ?? 0) : zeroInScope,
    inventoryValueCents: scope === "all" ? Number(totals?.value ?? 0) : valueInScope,
    byCategory: byCategory.map((r) => ({
      name: r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name,
      value: Number(r.stock),
      extra: Number(r.n),
    })),
    topSold: soldRows.map((r) => ({
      name: r.name.length > 28 ? `${r.name.slice(0, 26)}…` : r.name,
      value: Number(r.total) / 100,
      extra: Number(r.qty),
    })),
  };
}

export { monthStartSp, todaySp };
