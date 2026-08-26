import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { schema } from "@/db";
import { dayBoundsSp, monthStartSp, rangeBoundsSp, todaySp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";
import { PAGE_SIZE } from "./cadastros";

export type OrderStatus = "open" | "closed" | "cancelled";

export type OrderRow = {
  id: string;
  externalId: string | null;
  clientName: string | null;
  openedAt: Date;
  closedAt: Date | null;
  totalCents: number;
  status: OrderStatus;
  itemCount: number;
  profissional: string | null;
};

function orderSelectFields() {
  return {
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
  };
}

export async function listOpenOrders(opts?: { q?: string }) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const q = opts?.q?.trim();

  let where = and(
    eq(schema.orders.tenantId, tenant.id),
    eq(schema.orders.status, "open"),
    isNull(schema.orders.deletedAt)
  );

  if (q) {
    where = and(
      where,
      or(
        ilike(schema.clients.name, `%${q}%`),
        ilike(schema.orders.externalId, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select(orderSelectFields())
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where)
    .orderBy(desc(schema.orders.openedAt));

  const [totalRow] = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt)
      )
    );

  return {
    rows: rows as OrderRow[],
    total: Number(totalRow?.n ?? 0),
    totalCents: Number(totalRow?.total ?? 0),
    q: q ?? "",
  };
}

export async function listOrderHistory(opts: {
  from?: string;
  to?: string;
  status?: OrderStatus | "all";
  q?: string;
  page?: number;
}) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const from = opts.from ?? shiftDays(todaySp(), -30);
  const to = opts.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const status = opts.status ?? "all";
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();

  let where = and(
    eq(schema.orders.tenantId, tenant.id),
    gte(schema.orders.openedAt, start),
    lte(schema.orders.openedAt, end),
    isNull(schema.orders.deletedAt)
  );

  if (status !== "all") {
    where = and(where, eq(schema.orders.status, status));
  }

  if (q) {
    where = and(
      where,
      or(
        ilike(schema.clients.name, `%${q}%`),
        ilike(schema.orders.externalId, `%${q}%`)
      )
    );
  }

  const [totalRow] = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where);

  const rows = await db
    .select(orderSelectFields())
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where)
    .orderBy(desc(schema.orders.openedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const total = Number(totalRow?.n ?? 0);
  return {
    rows: rows as OrderRow[],
    total,
    totalCents: Number(totalRow?.total ?? 0),
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    from,
    to,
    status,
    q: q ?? "",
  };
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00-03:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export async function listTodayOpenOrders() {
  const { start, end } = dayBoundsSp();
  const tenant = await getDefaultTenant();
  const db = getDb();

  return db
    .select(orderSelectFields())
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        gte(schema.orders.openedAt, start),
        lte(schema.orders.openedAt, end),
        isNull(schema.orders.deletedAt)
      )
    )
    .orderBy(desc(schema.orders.openedAt));
}

export { monthStartSp, todaySp };
