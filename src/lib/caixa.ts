import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { schema } from "@/db";
import { dayBoundsSp, formatDateSp, todaySp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";

export type CaixaPaymentRow = {
  id: string;
  paidAt: Date;
  method: string;
  amountCents: number;
  clientName: string | null;
  orderExternalId: string | null;
};

export type CaixaByMethod = {
  method: string;
  count: number;
  totalCents: number;
};

export async function getCaixaDay(dateStr?: string) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const date = dateStr ?? todaySp();
  const { start, end } = dayBoundsSp(date);

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

  const payments = await db
    .select({
      id: schema.payments.id,
      paidAt: schema.payments.paidAt,
      method: schema.payments.method,
      amountCents: schema.payments.amountCents,
      clientName: schema.clients.name,
      orderExternalId: schema.orders.externalId,
    })
    .from(schema.payments)
    .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(
      and(
        eq(schema.payments.tenantId, tenant.id),
        gte(schema.payments.paidAt, start),
        lte(schema.payments.paidAt, end)
      )
    )
    .orderBy(desc(schema.payments.paidAt));

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
        gte(schema.orders.openedAt, start),
        lte(schema.orders.openedAt, end),
        isNull(schema.orders.deletedAt)
      )
    );

  const [cashSessions] = await db
    .select({ n: count() })
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, tenant.id),
        gte(schema.cashSessions.openedAt, start),
        lte(schema.cashSessions.openedAt, end)
      )
    );

  const totalCents = byMethod.reduce((s, r) => s + Number(r.totalCents), 0);

  return {
    date,
    hasImportedSessions: Number(cashSessions?.n ?? 0) > 0,
    totalCents,
    paymentCount: payments.length,
    closedOrdersCount: Number(closedOrders?.n ?? 0),
    closedOrdersCents: Number(closedOrders?.total ?? 0),
    openOrdersCount: Number(openOrders?.n ?? 0),
    byMethod: byMethod.map((r) => ({
      method: r.method,
      count: Number(r.n),
      totalCents: Number(r.totalCents),
    })) as CaixaByMethod[],
    payments: payments as CaixaPaymentRow[],
  };
}

export { todaySp, formatDateSp };
