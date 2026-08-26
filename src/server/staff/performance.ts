import { and, count, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { monthStartSp, rangeBoundsSp, todaySp } from "@/lib/datetime";
import { requireTenantContext } from "../context/tenant";
import { getStaffMember } from "./queries";

const commissionExpr = sql<number>`coalesce(
  ${schema.orderItems.commissionCents},
  (${schema.orderItems.totalCents} * coalesce(${schema.orderItems.commissionBps}, 0) / 10000)
)::int`;

export type StaffPerformanceOrder = {
  id: string;
  externalId: string | null;
  openedAt: Date;
  status: string;
  totalCents: number;
  commissionCents: number;
};

export type StaffPerformanceTopService = {
  description: string;
  count: number;
  totalCents: number;
};

/** Métricas sensíveis — só exibir para owner / admin / manager */
export type StaffManagementMetrics = {
  appointmentsTotal: number;
  cancelledCount: number;
  noShowCount: number;
  cancellationRatePct: number;
};

export type StaffPerformance = {
  from: string;
  to: string;
  revenueClosedCents: number;
  commissionClosedCents: number;
  commissionOpenCents: number;
  discountCents: number;
  ordersClosed: number;
  ordersOpen: number;
  itemsTotal: number;
  topServices: StaffPerformanceTopService[];
  recentOrders: StaffPerformanceOrder[];
  management: StaffManagementMetrics | null;
};

export async function getStaffPerformance(
  staffId: string,
  opts?: { from?: string; to?: string; includeManagementMetrics?: boolean }
): Promise<StaffPerformance> {
  const tenant = await requireTenantContext();
  const db = createDb();
  await getStaffMember(staffId);

  const from = opts?.from ?? monthStartSp();
  const to = opts?.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);

  const itemPeriodWhere = and(
    eq(schema.orderItems.staffId, staffId),
    eq(schema.orderItems.tenantId, tenant.id),
    gte(schema.orderItems.performedAt, start),
    lte(schema.orderItems.performedAt, end)
  );

  const [[closedAgg], [openAgg], [discountAgg], [itemsCount], topServices, recentOrdersRaw] =
    await Promise.all([
      db
        .select({
          revenue: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
          commission: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
          orders: sql<number>`count(distinct ${schema.orderItems.orderId})::int`,
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
        .where(and(itemPeriodWhere, eq(schema.orders.status, "closed"))),
      db
        .select({
          commission: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
          orders: sql<number>`count(distinct ${schema.orderItems.orderId})::int`,
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
        .where(and(itemPeriodWhere, eq(schema.orders.status, "open"))),
      db
        .select({
          discount: sql<number>`coalesce(sum(${schema.orderItems.discountCents}), 0)::int`,
        })
        .from(schema.orderItems)
        .where(itemPeriodWhere),
      db.select({ n: count() }).from(schema.orderItems).where(itemPeriodWhere),
      db
        .select({
          description: schema.orderItems.description,
          count: sql<number>`count(*)::int`,
          totalCents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
        })
        .from(schema.orderItems)
        .where(and(itemPeriodWhere, eq(schema.orderItems.itemType, "service")))
        .groupBy(schema.orderItems.description)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
      db
        .select({
          id: schema.orders.id,
          externalId: schema.orders.externalId,
          openedAt: schema.orders.openedAt,
          status: schema.orders.status,
          totalCents: schema.orders.totalCents,
          commissionCents: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`.as(
            "commission_cents"
          ),
        })
        .from(schema.orders)
        .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
        .where(
          and(
            eq(schema.orderItems.staffId, staffId),
            eq(schema.orderItems.tenantId, tenant.id),
            gte(schema.orderItems.performedAt, start),
            lte(schema.orderItems.performedAt, end)
          )
        )
        .groupBy(
          schema.orders.id,
          schema.orders.externalId,
          schema.orders.openedAt,
          schema.orders.status,
          schema.orders.totalCents
        )
        .orderBy(desc(schema.orders.openedAt))
        .limit(10),
    ]);

  let management: StaffManagementMetrics | null = null;

  if (opts?.includeManagementMetrics) {
    const apptWhere = and(
      eq(schema.appointments.staffId, staffId),
      eq(schema.appointments.tenantId, tenant.id),
      isNull(schema.appointments.deletedAt),
      gte(schema.appointments.startsAt, start),
      lte(schema.appointments.startsAt, end),
      ne(schema.appointments.status, "blocked")
    );

    const [apptAgg] = await db
      .select({
        total: count(),
        cancelled: sql<number>`count(*) filter (where ${schema.appointments.status} = 'cancelled')::int`,
        noShow: sql<number>`count(*) filter (where ${schema.appointments.status} = 'no_show')::int`,
      })
      .from(schema.appointments)
      .where(apptWhere);

    const appointmentsTotal = Number(apptAgg?.total ?? 0);
    const cancelledCount = Number(apptAgg?.cancelled ?? 0);
    const noShowCount = Number(apptAgg?.noShow ?? 0);
    const negative = cancelledCount + noShowCount;

    management = {
      appointmentsTotal,
      cancelledCount,
      noShowCount,
      cancellationRatePct:
        appointmentsTotal > 0 ? Math.round((negative / appointmentsTotal) * 1000) / 10 : 0,
    };
  }

  return {
    from,
    to,
    revenueClosedCents: Number(closedAgg?.revenue ?? 0),
    commissionClosedCents: Number(closedAgg?.commission ?? 0),
    commissionOpenCents: Number(openAgg?.commission ?? 0),
    discountCents: Number(discountAgg?.discount ?? 0),
    ordersClosed: Number(closedAgg?.orders ?? 0),
    ordersOpen: Number(openAgg?.orders ?? 0),
    itemsTotal: Number(itemsCount?.n ?? 0),
    topServices: topServices.map((s) => ({
      description: s.description,
      count: Number(s.count),
      totalCents: Number(s.totalCents),
    })),
    recentOrders: recentOrdersRaw.map((o) => ({
      ...o,
      commissionCents: Number(o.commissionCents),
    })),
    management,
  };
}
