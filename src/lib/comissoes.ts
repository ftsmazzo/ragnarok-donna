import { and, asc, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { schema } from "@/db";
import { monthStartSp, rangeBoundsSp, todaySp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";
import { PAGE_SIZE } from "./cadastros";

const commissionExpr = sql<number>`coalesce(
  ${schema.orderItems.commissionCents},
  (${schema.orderItems.totalCents} * coalesce(${schema.orderItems.commissionBps}, 0) / 10000)
)::int`;

export type CommissionStaffRow = {
  staffId: string | null;
  staffName: string | null;
  itemCount: number;
  revenueCents: number;
  commissionCents: number;
};

export type CommissionItemRow = {
  id: string;
  performedAt: Date | null;
  staffName: string | null;
  description: string;
  itemType: string;
  totalCents: number;
  commissionBps: number | null;
  commissionCents: number;
  clientName: string | null;
};

export async function reportCommissions(opts: {
  from?: string;
  to?: string;
  staffId?: string;
  page?: number;
}) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const from = opts.from ?? monthStartSp();
  const to = opts.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const page = Math.max(1, opts.page ?? 1);

  let itemWhere = and(
    eq(schema.orderItems.tenantId, tenant.id),
    gte(schema.orderItems.performedAt, start),
    lte(schema.orderItems.performedAt, end)
  );

  if (opts.staffId) {
    itemWhere = and(itemWhere, eq(schema.orderItems.staffId, opts.staffId));
  }

  const byStaff = await db
    .select({
      staffId: schema.orderItems.staffId,
      staffName: schema.staff.name,
      itemCount: count(),
      revenueCents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
      commissionCents: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
    })
    .from(schema.orderItems)
    .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenant.id),
        gte(schema.orderItems.performedAt, start),
        lte(schema.orderItems.performedAt, end)
      )
    )
    .groupBy(schema.orderItems.staffId, schema.staff.name)
    .orderBy(desc(sql`sum(${commissionExpr})`));

  const [totals] = await db
    .select({
      n: count(),
      revenue: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
      commission: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
    })
    .from(schema.orderItems)
    .where(itemWhere);

  const items = await db
    .select({
      id: schema.orderItems.id,
      performedAt: schema.orderItems.performedAt,
      staffName: schema.staff.name,
      description: schema.orderItems.description,
      itemType: schema.orderItems.itemType,
      totalCents: schema.orderItems.totalCents,
      commissionBps: schema.orderItems.commissionBps,
      commissionCents: commissionExpr.as("commission_cents"),
      clientName: schema.clients.name,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(itemWhere)
    .orderBy(desc(schema.orderItems.performedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const staffList = await db
    .select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff)
    .where(and(eq(schema.staff.tenantId, tenant.id), isNull(schema.staff.deletedAt)))
    .orderBy(asc(schema.staff.name));

  const byTypeRows = await db
    .select({
      itemType: schema.orderItems.itemType,
      n: count(),
      commission: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
    })
    .from(schema.orderItems)
    .where(itemWhere)
    .groupBy(schema.orderItems.itemType)
    .orderBy(desc(sql`sum(${commissionExpr})`));

  const total = Number(totals?.n ?? 0);

  return {
    from,
    to,
    staffId: opts.staffId ?? "",
    byStaff: byStaff as CommissionStaffRow[],
    byType: byTypeRows.map((r) => ({
      itemType: r.itemType,
      itemCount: Number(r.n),
      commissionCents: Number(r.commission),
    })),
    items: items as CommissionItemRow[],
    totalItems: total,
    totalRevenueCents: Number(totals?.revenue ?? 0),
    totalCommissionCents: Number(totals?.commission ?? 0),
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    staffList,
  };
}

export { monthStartSp, todaySp };
