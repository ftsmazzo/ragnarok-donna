import { and, eq, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";

/** Garante orders.total_cents = soma dos itens (cura cabeçalho zerado com itens). */
export async function ensureOrderTotalSynced(
  orderId: string,
  tenantId: string
): Promise<number> {
  const db = createDb();
  const [order] = await db
    .select({ totalCents: schema.orders.totalCents })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
    .limit(1);
  if (!order) return 0;

  const [agg] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
    })
    .from(schema.orderItems)
    .where(
      and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.tenantId, tenantId))
    );
  const itemsSum = Number(agg?.total ?? 0);
  if (itemsSum !== Number(order.totalCents ?? 0)) {
    await db
      .update(schema.orders)
      .set({ totalCents: itemsSum, updatedAt: new Date() })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)));
  }
  return itemsSum;
}
