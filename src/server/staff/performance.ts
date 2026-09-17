import { and, count, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { monthStartSp, rangeBoundsSp, shiftDateSp, todaySp } from "@/lib/datetime";
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

export type StaffClientCohort = {
  /** Clientes distintos atendidos (serviço fechado) no período */
  served: number;
  /** Primeira visita do cliente (serviço) caiu no período, com este barbeiro */
  newcomers: number;
  /** Já vinham antes e voltaram neste período com este barbeiro */
  returning: number;
  /** Última visita com este barbeiro há 30–90 dias (ainda não voltaram) */
  lapsed30: number;
};

export type StaffPeriodDelta = {
  prevFrom: string;
  prevTo: string;
  revenueClosedCents: number;
  ordersClosed: number;
  clientsServed: number;
  revenueDeltaPct: number | null;
  ordersDeltaPct: number | null;
  clientsDeltaPct: number | null;
};

export type StaffClientGoal = {
  target: number;
  current: number;
  remaining: number;
  progressPct: number | null;
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
  /** Ticket médio = faturamento fechado / comandas fechadas */
  ticketAvgCents: number;
  /** Itens de serviço (qtd) no período */
  serviceItemsCount: number;
  /** Produtos (extras) — qty e R$ em comandas fechadas */
  productsQty: number;
  productsCents: number;
  packagesCents: number;
  cohorts: StaffClientCohort;
  previous: StaffPeriodDelta;
  clientGoal: StaffClientGoal | null;
  topServices: StaffPerformanceTopService[];
  recentOrders: StaffPerformanceOrder[];
  management: StaffManagementMetrics | null;
};

function pctDelta(current: number, prev: number): number | null {
  if (prev <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - prev) / prev) * 1000) / 10;
}

function previousRange(from: string, to: string): { prevFrom: string; prevTo: string } {
  const start = new Date(`${from}T12:00:00-03:00`);
  const end = new Date(`${to}T12:00:00-03:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const prevTo = shiftDateSp(from, -1);
  const prevFrom = shiftDateSp(prevTo, -(days - 1));
  return { prevFrom, prevTo };
}

async function closedAggForStaff(
  staffId: string,
  tenantId: string,
  from: string,
  to: string
) {
  const db = createDb();
  const { start, end } = rangeBoundsSp(from, to);
  const itemPeriodWhere = and(
    eq(schema.orderItems.staffId, staffId),
    eq(schema.orderItems.tenantId, tenantId),
    gte(schema.orderItems.performedAt, start),
    lte(schema.orderItems.performedAt, end)
  );

  const [[closed], byType, [clients]] = await Promise.all([
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
        itemType: schema.orderItems.itemType,
        qty: sql<number>`coalesce(sum(${schema.orderItems.qty}), 0)::int`,
        cents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
        items: sql<number>`count(*)::int`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(and(itemPeriodWhere, eq(schema.orders.status, "closed")))
      .groupBy(schema.orderItems.itemType),
    db
      .select({
        n: sql<number>`count(distinct ${schema.orders.clientId})::int`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(
        and(
          itemPeriodWhere,
          eq(schema.orders.status, "closed"),
          eq(schema.orderItems.itemType, "service"),
          sql`${schema.orders.clientId} is not null`
        )
      ),
  ]);

  let productsQty = 0;
  let productsCents = 0;
  let packagesCents = 0;
  let serviceItemsCount = 0;
  for (const row of byType) {
    if (row.itemType === "product") {
      productsQty = Number(row.qty);
      productsCents = Number(row.cents);
    } else if (row.itemType === "package") {
      packagesCents = Number(row.cents);
    } else if (row.itemType === "service") {
      serviceItemsCount = Number(row.items);
    }
  }

  return {
    revenue: Number(closed?.revenue ?? 0),
    commission: Number(closed?.commission ?? 0),
    orders: Number(closed?.orders ?? 0),
    clientsServed: Number(clients?.n ?? 0),
    productsQty,
    productsCents,
    packagesCents,
    serviceItemsCount,
  };
}

/** Cohorts de cliente para o barbeiro no período. */
async function clientCohortsForStaff(
  staffId: string,
  tenantId: string,
  from: string,
  to: string
): Promise<StaffClientCohort> {
  const db = createDb();
  const { start, end } = rangeBoundsSp(from, to);

  const result = await db.execute(sql`
    with staff_visits as (
      select
        o.client_id,
        min(oi.performed_at) as first_with_staff,
        max(oi.performed_at) as last_with_staff
      from order_items oi
      inner join orders o on o.id = oi.order_id
      where oi.tenant_id = ${tenantId}
        and oi.staff_id = ${staffId}
        and o.tenant_id = ${tenantId}
        and o.status = 'closed'
        and o.deleted_at is null
        and o.client_id is not null
        and oi.item_type = 'service'
        and oi.performed_at is not null
      group by o.client_id
    ),
    first_any as (
      select
        o.client_id,
        min(oi.performed_at) as first_visit
      from order_items oi
      inner join orders o on o.id = oi.order_id
      where oi.tenant_id = ${tenantId}
        and o.tenant_id = ${tenantId}
        and o.status = 'closed'
        and o.deleted_at is null
        and o.client_id is not null
        and oi.item_type = 'service'
        and oi.performed_at is not null
      group by o.client_id
    ),
    in_period as (
      select distinct o.client_id
      from order_items oi
      inner join orders o on o.id = oi.order_id
      where oi.tenant_id = ${tenantId}
        and oi.staff_id = ${staffId}
        and o.status = 'closed'
        and o.deleted_at is null
        and o.client_id is not null
        and oi.item_type = 'service'
        and oi.performed_at >= ${start.toISOString()}::timestamptz
        and oi.performed_at <= ${end.toISOString()}::timestamptz
    )
    select
      (select count(*)::int from in_period) as served,
      (
        select count(*)::int
        from in_period ip
        inner join first_any fa on fa.client_id = ip.client_id
        where fa.first_visit >= ${start.toISOString()}::timestamptz
          and fa.first_visit <= ${end.toISOString()}::timestamptz
      ) as newcomers,
      (
        select count(*)::int
        from in_period ip
        inner join first_any fa on fa.client_id = ip.client_id
        where fa.first_visit < ${start.toISOString()}::timestamptz
      ) as returning,
      (
        select count(*)::int
        from staff_visits sv
        where sv.last_with_staff < now() - interval '30 days'
          and sv.last_with_staff >= now() - interval '90 days'
          and sv.client_id not in (select client_id from in_period)
      ) as lapsed30
  `);

  const row = ([...result] as unknown as Record<string, unknown>[])[0] ?? {};

  return {
    served: Number(row.served ?? 0),
    newcomers: Number(row.newcomers ?? 0),
    returning: Number(row.returning ?? 0),
    lapsed30: Number(row.lapsed30 ?? 0),
  };
}

export async function getStaffPerformance(
  staffId: string,
  opts?: { from?: string; to?: string; includeManagementMetrics?: boolean }
): Promise<StaffPerformance> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const staff = await getStaffMember(staffId);

  const from = opts?.from ?? monthStartSp();
  const to = opts?.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const { prevFrom, prevTo } = previousRange(from, to);

  const itemPeriodWhere = and(
    eq(schema.orderItems.staffId, staffId),
    eq(schema.orderItems.tenantId, tenant.id),
    gte(schema.orderItems.performedAt, start),
    lte(schema.orderItems.performedAt, end)
  );

  const [
    periodClosed,
    prevClosed,
    cohorts,
    [openAgg],
    [discountAgg],
    [itemsCount],
    topServices,
    recentOrdersRaw,
  ] = await Promise.all([
    closedAggForStaff(staffId, tenant.id, from, to),
    closedAggForStaff(staffId, tenant.id, prevFrom, prevTo),
    clientCohortsForStaff(staffId, tenant.id, from, to),
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

  const ordersClosed = periodClosed.orders;
  const ticketAvgCents =
    ordersClosed > 0 ? Math.round(periodClosed.revenue / ordersClosed) : 0;

  const meta = (staff.meta ?? {}) as Record<string, unknown>;
  const goalRaw = meta.monthlyTargetClients;
  const goalTarget =
    typeof goalRaw === "number" && Number.isFinite(goalRaw) && goalRaw > 0
      ? Math.floor(goalRaw)
      : typeof goalRaw === "string" && Number(goalRaw) > 0
        ? Math.floor(Number(goalRaw))
        : 0;

  const clientGoal: StaffClientGoal | null =
    goalTarget > 0
      ? {
          target: goalTarget,
          current: cohorts.served,
          remaining: Math.max(0, goalTarget - cohorts.served),
          progressPct: Math.min(100, Math.round((cohorts.served / goalTarget) * 1000) / 10),
        }
      : null;

  return {
    from,
    to,
    revenueClosedCents: periodClosed.revenue,
    commissionClosedCents: periodClosed.commission,
    commissionOpenCents: Number(openAgg?.commission ?? 0),
    discountCents: Number(discountAgg?.discount ?? 0),
    ordersClosed,
    ordersOpen: Number(openAgg?.orders ?? 0),
    itemsTotal: Number(itemsCount?.n ?? 0),
    ticketAvgCents,
    serviceItemsCount: periodClosed.serviceItemsCount,
    productsQty: periodClosed.productsQty,
    productsCents: periodClosed.productsCents,
    packagesCents: periodClosed.packagesCents,
    cohorts,
    previous: {
      prevFrom,
      prevTo,
      revenueClosedCents: prevClosed.revenue,
      ordersClosed: prevClosed.orders,
      clientsServed: prevClosed.clientsServed,
      revenueDeltaPct: pctDelta(periodClosed.revenue, prevClosed.revenue),
      ordersDeltaPct: pctDelta(periodClosed.orders, prevClosed.orders),
      clientsDeltaPct: pctDelta(cohorts.served, prevClosed.clientsServed),
    },
    clientGoal,
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
