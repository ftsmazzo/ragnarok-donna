import { and, count, eq, gte, isNull, lte } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp } from "@/lib/datetime";
import { listTenantBranches } from "../context/branch";

export type BranchOverview = {
  slug: string;
  name: string;
  clients: number;
  staff: number;
  appointmentsToday: number;
  openOrdersToday: number;
};

export type ConsolidatedOverview = {
  branches: BranchOverview[];
  totals: {
    clients: number;
    staff: number;
    appointmentsToday: number;
    openOrdersToday: number;
  };
};

export async function getConsolidatedOverview(tenantId: string): Promise<ConsolidatedOverview> {
  const db = createDb();
  const branches = await listTenantBranches(tenantId);
  const { start, end } = dayBoundsSp();

  const branchStats: BranchOverview[] = [];

  for (const branch of branches) {
    const staffWhere = and(
      eq(schema.staff.tenantId, tenantId),
      eq(schema.staff.branchId, branch.id),
      isNull(schema.staff.deletedAt)
    );

    const [[clients], [staff], [apptToday], [openOrders]] = await Promise.all([
      db.select({ n: count() }).from(schema.clients).where(eq(schema.clients.tenantId, tenantId)),
      db.select({ n: count() }).from(schema.staff).where(staffWhere),
      db
        .select({ n: count() })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.tenantId, tenantId),
            eq(schema.appointments.branchId, branch.id),
            gte(schema.appointments.startsAt, start),
            lte(schema.appointments.startsAt, end),
            isNull(schema.appointments.deletedAt)
          )
        ),
      db
        .select({ n: count() })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.tenantId, tenantId),
            eq(schema.orders.branchId, branch.id),
            eq(schema.orders.status, "open"),
            gte(schema.orders.openedAt, start),
            lte(schema.orders.openedAt, end),
            isNull(schema.orders.deletedAt)
          )
        ),
    ]);

    const staffN = Number(staff?.n ?? 0);
    branchStats.push({
      slug: branch.slug,
      name: branch.name,
      clients: staffN > 0 ? Number(clients?.n ?? 0) : 0,
      staff: staffN,
      appointmentsToday: Number(apptToday?.n ?? 0),
      openOrdersToday: Number(openOrders?.n ?? 0),
    });
  }

  return {
    branches: branchStats,
    totals: {
      clients: branchStats.reduce((s, b) => Math.max(s, b.clients), 0),
      staff: branchStats.reduce((s, b) => s + b.staff, 0),
      appointmentsToday: branchStats.reduce((s, b) => s + b.appointmentsToday, 0),
      openOrdersToday: branchStats.reduce((s, b) => s + b.openOrdersToday, 0),
    },
  };
}
