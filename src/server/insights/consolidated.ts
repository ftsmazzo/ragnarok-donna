import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, monthStartSp, rangeBoundsSp, todaySp } from "@/lib/datetime";
import { listTenantBranches } from "../context/branch";

export type BranchOverview = {
  slug: string;
  name: string;
  staff: number;
  appointmentsToday: number;
  clientsToday: number;
  openOrdersToday: number;
  revenueTodayCents: number;
  revenueMonthCents: number;
};

export type ConsolidatedOverview = {
  branches: BranchOverview[];
  totals: {
    staff: number;
    appointmentsToday: number;
    clientsToday: number;
    openOrdersToday: number;
    revenueTodayCents: number;
    revenueMonthCents: number;
  };
};

export async function getConsolidatedOverview(tenantId: string): Promise<ConsolidatedOverview> {
  const db = createDb();
  const branches = await listTenantBranches(tenantId);
  const { start, end } = dayBoundsSp();
  const { start: monthStart, end: monthEnd } = rangeBoundsSp(monthStartSp(), todaySp());

  const branchStats: BranchOverview[] = [];

  for (const branch of branches) {
    const staffWhere = and(
      eq(schema.staff.tenantId, tenantId),
      eq(schema.staff.branchId, branch.id),
      isNull(schema.staff.deletedAt)
    );

    const apptWhere = and(
      eq(schema.appointments.tenantId, tenantId),
      eq(schema.appointments.branchId, branch.id),
      gte(schema.appointments.startsAt, start),
      lte(schema.appointments.startsAt, end),
      isNull(schema.appointments.deletedAt)
    );

    const openOrdersWhere = and(
      eq(schema.orders.tenantId, tenantId),
      eq(schema.orders.branchId, branch.id),
      eq(schema.orders.status, "open"),
      isNull(schema.orders.deletedAt)
    );

    const revenueTodayWhere = and(
      eq(schema.payments.tenantId, tenantId),
      eq(schema.orders.branchId, branch.id),
      gte(schema.payments.paidAt, start),
      lte(schema.payments.paidAt, end)
    );

    const revenueMonthWhere = and(
      eq(schema.payments.tenantId, tenantId),
      eq(schema.orders.branchId, branch.id),
      gte(schema.payments.paidAt, monthStart),
      lte(schema.payments.paidAt, monthEnd)
    );

    const [[staff], [apptToday], [clientsToday], [openOrders], [revToday], [revMonth]] =
      await Promise.all([
        db.select({ n: count() }).from(schema.staff).where(staffWhere),
        db.select({ n: count() }).from(schema.appointments).where(apptWhere),
        db
          .select({
            n: sql<number>`count(distinct ${schema.appointments.clientId})::int`,
          })
          .from(schema.appointments)
          .where(and(apptWhere, sql`${schema.appointments.clientId} is not null`)),
        db.select({ n: count() }).from(schema.orders).where(openOrdersWhere),
        db
          .select({
            total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
          })
          .from(schema.payments)
          .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
          .where(revenueTodayWhere),
        db
          .select({
            total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
          })
          .from(schema.payments)
          .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
          .where(revenueMonthWhere),
      ]);

    const staffN = Number(staff?.n ?? 0);
    branchStats.push({
      slug: branch.slug,
      name: branch.name,
      staff: staffN,
      appointmentsToday: staffN > 0 ? Number(apptToday?.n ?? 0) : 0,
      clientsToday: staffN > 0 ? Number(clientsToday?.n ?? 0) : 0,
      openOrdersToday: staffN > 0 ? Number(openOrders?.n ?? 0) : 0,
      revenueTodayCents: staffN > 0 ? Number(revToday?.total ?? 0) : 0,
      revenueMonthCents: staffN > 0 ? Number(revMonth?.total ?? 0) : 0,
    });
  }

  return {
    branches: branchStats,
    totals: {
      staff: branchStats.reduce((s, b) => s + b.staff, 0),
      appointmentsToday: branchStats.reduce((s, b) => s + b.appointmentsToday, 0),
      clientsToday: branchStats.reduce((s, b) => s + b.clientsToday, 0),
      openOrdersToday: branchStats.reduce((s, b) => s + b.openOrdersToday, 0),
      revenueTodayCents: branchStats.reduce((s, b) => s + b.revenueTodayCents, 0),
      revenueMonthCents: branchStats.reduce((s, b) => s + b.revenueMonthCents, 0),
    },
  };
}
