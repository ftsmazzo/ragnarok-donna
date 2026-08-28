import { and, asc, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { monthStartSp, rangeBoundsSp, shiftDateSp, todaySp } from "@/lib/datetime";
import { resolveBranchScope, withBranchScope } from "../context/branch-scope";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { getWeeklyInsights } from "./queries";
import { labelApptStatus, labelPaymentMethod } from "@/lib/format";

export type DashboardPoint = { key: string; label: string; value: number };
export type DashboardNamedValue = { name: string; value: number; extra?: number };

export type ManagementDashboard = {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  canSeeFinance: boolean;
  revenueCents: number;
  prevRevenueCents: number;
  revenueDeltaPct: number | null;
  closedOrders: number;
  ticketAvgCents: number;
  appointmentsTotal: number;
  noShowRatePct: number;
  cancelRatePct: number;
  revenueSeries: DashboardPoint[];
  paymentMix: DashboardNamedValue[];
  appointmentStatus: DashboardNamedValue[];
  topServices: DashboardNamedValue[];
  topStaff: DashboardNamedValue[];
  weeklyTips: string[];
};

function periodLengthDays(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00-03:00`).getTime();
  const b = new Date(`${to}T12:00:00-03:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function previousRange(from: string, to: string) {
  const days = periodLengthDays(from, to);
  const prevTo = shiftDateSp(from, -1);
  const prevFrom = shiftDateSp(prevTo, -days);
  return { prevFrom, prevTo };
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getManagementDashboard(opts?: {
  from?: string;
  to?: string;
}): Promise<ManagementDashboard> {
  const session = await requireSession();
  const tenant = await requireTenantContext();
  const scope = await resolveBranchScope();
  const db = createDb();
  const from = opts?.from ?? monthStartSp();
  const to = opts?.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const { prevFrom, prevTo } = previousRange(from, to);
  const prev = rangeBoundsSp(prevFrom, prevTo);
  const canSeeFinance = hasCapability(session.role, "reports.management");

  if (scope.isInactiveBranch) {
    return {
      from,
      to,
      prevFrom,
      prevTo,
      canSeeFinance,
      revenueCents: 0,
      prevRevenueCents: 0,
      revenueDeltaPct: null,
      closedOrders: 0,
      ticketAvgCents: 0,
      appointmentsTotal: 0,
      noShowRatePct: 0,
      cancelRatePct: 0,
      revenueSeries: [],
      paymentMix: [],
      appointmentStatus: [],
      topServices: [],
      topStaff: [],
      weeklyTips: [],
    };
  }

  const orderBranch = (extra?: ReturnType<typeof and>) =>
    withBranchScope(scope, schema.orders.branchId, extra);
  const apptBranch = (extra?: ReturnType<typeof and>) =>
    withBranchScope(scope, schema.appointments.branchId, extra);

  const [
    [revNow],
    [revPrev],
    [closedNow],
    statusRows,
    seriesRows,
    methodRows,
    topServiceRows,
    topStaffRows,
    weekly,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
      })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
      .where(
        orderBranch(
          and(
            eq(schema.payments.tenantId, tenant.id),
            eq(schema.orders.tenantId, tenant.id),
            gte(schema.payments.paidAt, start),
            lte(schema.payments.paidAt, end)
          )
        )
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
      })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
      .where(
        orderBranch(
          and(
            eq(schema.payments.tenantId, tenant.id),
            eq(schema.orders.tenantId, tenant.id),
            gte(schema.payments.paidAt, prev.start),
            lte(schema.payments.paidAt, prev.end)
          )
        )
      ),
    db
      .select({
        n: count(),
        total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
      })
      .from(schema.orders)
      .where(
        orderBranch(
          and(
            eq(schema.orders.tenantId, tenant.id),
            eq(schema.orders.status, "closed"),
            gte(schema.orders.closedAt, start),
            lte(schema.orders.closedAt, end),
            isNull(schema.orders.deletedAt)
          )
        )
      ),
    db
      .select({
        status: schema.appointments.status,
        n: count(),
      })
      .from(schema.appointments)
      .where(
        apptBranch(
          and(
            eq(schema.appointments.tenantId, tenant.id),
            gte(schema.appointments.startsAt, start),
            lte(schema.appointments.startsAt, end),
            isNull(schema.appointments.deletedAt),
            sql`${schema.appointments.status} <> 'blocked'`
          )
        )
      )
      .groupBy(schema.appointments.status),
    db
      .select({
        day: sql<string>`to_char((${schema.payments.paidAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`,
        total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
      })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
      .where(
        orderBranch(
          and(
            eq(schema.payments.tenantId, tenant.id),
            eq(schema.orders.tenantId, tenant.id),
            gte(schema.payments.paidAt, start),
            lte(schema.payments.paidAt, end)
          )
        )
      )
      .groupBy(sql`to_char((${schema.payments.paidAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`)
      .orderBy(asc(sql`to_char((${schema.payments.paidAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`)),
    db
      .select({
        method: schema.payments.method,
        total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
      })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
      .where(
        orderBranch(
          and(
            eq(schema.payments.tenantId, tenant.id),
            eq(schema.orders.tenantId, tenant.id),
            gte(schema.payments.paidAt, start),
            lte(schema.payments.paidAt, end)
          )
        )
      )
      .groupBy(schema.payments.method)
      .orderBy(desc(sql`sum(${schema.payments.amountCents})`)),
    db
      .select({
        name: schema.orderItems.description,
        n: count(),
        total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(
        orderBranch(
          and(
            eq(schema.orderItems.tenantId, tenant.id),
            eq(schema.orders.tenantId, tenant.id),
            eq(schema.orderItems.itemType, "service"),
            eq(schema.orders.status, "closed"),
            gte(schema.orders.closedAt, start),
            lte(schema.orders.closedAt, end),
            isNull(schema.orders.deletedAt)
          )
        )
      )
      .groupBy(schema.orderItems.description)
      .orderBy(desc(sql`sum(${schema.orderItems.totalCents})`))
      .limit(8),
    db
      .select({
        name: schema.staff.name,
        total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
        n: count(),
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .innerJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
      .where(
        withBranchScope(
          scope,
          schema.staff.branchId,
          and(
            eq(schema.orderItems.tenantId, tenant.id),
            eq(schema.orders.tenantId, tenant.id),
            eq(schema.orders.status, "closed"),
            gte(schema.orders.closedAt, start),
            lte(schema.orders.closedAt, end),
            isNull(schema.orders.deletedAt),
            isNull(schema.staff.deletedAt)
          )
        )
      )
      .groupBy(schema.staff.name)
      .orderBy(desc(sql`sum(${schema.orderItems.totalCents})`))
      .limit(8),
    getWeeklyInsights(),
  ]);

  const revenueCents = Number(revNow?.total ?? 0);
  const prevRevenueCents = Number(revPrev?.total ?? 0);
  const closedOrders = Number(closedNow?.n ?? 0);
  const closedCents = Number(closedNow?.total ?? 0);
  const ticketAvgCents = closedOrders > 0 ? Math.round(closedCents / closedOrders) : 0;

  const appointmentsTotal = statusRows.reduce((s, r) => s + Number(r.n), 0);
  const noShow = Number(statusRows.find((r) => r.status === "no_show")?.n ?? 0);
  const cancelled = Number(statusRows.find((r) => r.status === "cancelled")?.n ?? 0);
  const noShowRatePct =
    appointmentsTotal > 0 ? Math.round((noShow / appointmentsTotal) * 1000) / 10 : 0;
  const cancelRatePct =
    appointmentsTotal > 0 ? Math.round((cancelled / appointmentsTotal) * 1000) / 10 : 0;

  const revenueSeries: DashboardPoint[] = seriesRows.map((r) => {
    const key = String(r.day);
    const [, m, d] = key.split("-");
    return {
      key,
      label: `${d}/${m}`,
      value: Number(r.total ?? 0) / 100,
    };
  });

  const paymentMix: DashboardNamedValue[] = methodRows.map((r) => ({
    name: labelPaymentMethod(r.method),
    value: Number(r.total ?? 0) / 100,
  }));

  const appointmentStatus: DashboardNamedValue[] = statusRows.map((r) => ({
    name: labelApptStatus(r.status),
    value: Number(r.n),
  }));

  const topServices: DashboardNamedValue[] = topServiceRows.map((r) => ({
    name: r.name.length > 28 ? `${r.name.slice(0, 26)}…` : r.name,
    value: Number(r.total ?? 0) / 100,
    extra: Number(r.n),
  }));

  const topStaff: DashboardNamedValue[] = topStaffRows.map((r) => ({
    name: r.name,
    value: Number(r.total ?? 0) / 100,
    extra: Number(r.n),
  }));

  return {
    from,
    to,
    prevFrom,
    prevTo,
    canSeeFinance,
    revenueCents: canSeeFinance ? revenueCents : 0,
    prevRevenueCents: canSeeFinance ? prevRevenueCents : 0,
    revenueDeltaPct: canSeeFinance ? deltaPct(revenueCents, prevRevenueCents) : null,
    closedOrders: canSeeFinance ? closedOrders : 0,
    ticketAvgCents: canSeeFinance ? ticketAvgCents : 0,
    appointmentsTotal,
    noShowRatePct,
    cancelRatePct,
    revenueSeries: canSeeFinance ? revenueSeries : [],
    paymentMix: canSeeFinance ? paymentMix : [],
    appointmentStatus,
    topServices: canSeeFinance ? topServices : [],
    topStaff: canSeeFinance ? topStaff : [],
    weeklyTips: weekly.tips,
  };
}
