import { and, asc, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { schema } from "@/db";
import { dayBoundsSp, formatDateSp, rangeBoundsSp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";

export type WaitlistRow = {
  id: string;
  phone: string | null;
  clientName: string | null;
  staffName: string | null;
  serviceName: string | null;
  desiredDate: Date | null;
  status: string;
  notes: string | null;
  notifiedAt: Date | null;
};

export type WaitlistFilter = "waiting" | "notified" | "all";

export async function listWaitlist(opts?: { filter?: WaitlistFilter }) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const filter = opts?.filter ?? "waiting";

  let where = eq(schema.waitlistEntries.tenantId, tenant.id);
  if (filter === "waiting") {
    where = and(where, eq(schema.waitlistEntries.status, "waiting"))!;
  } else if (filter === "notified") {
    where = and(where, eq(schema.waitlistEntries.status, "notified"))!;
  }

  const rows = await db
    .select({
      id: schema.waitlistEntries.id,
      phone: schema.waitlistEntries.phone,
      clientName: schema.clients.name,
      staffName: schema.staff.name,
      serviceName: schema.services.name,
      desiredDate: schema.waitlistEntries.desiredDate,
      status: schema.waitlistEntries.status,
      notes: schema.waitlistEntries.notes,
      notifiedAt: schema.waitlistEntries.notifiedAt,
    })
    .from(schema.waitlistEntries)
    .leftJoin(schema.clients, eq(schema.waitlistEntries.clientId, schema.clients.id))
    .leftJoin(schema.staff, eq(schema.waitlistEntries.staffId, schema.staff.id))
    .leftJoin(schema.services, eq(schema.waitlistEntries.serviceId, schema.services.id))
    .where(where)
    .orderBy(asc(schema.waitlistEntries.desiredDate));

  const [waitingCount] = await db
    .select({ n: count() })
    .from(schema.waitlistEntries)
    .where(
      and(
        eq(schema.waitlistEntries.tenantId, tenant.id),
        eq(schema.waitlistEntries.status, "waiting")
      )
    );

  const [notifiedCount] = await db
    .select({ n: count() })
    .from(schema.waitlistEntries)
    .where(
      and(
        eq(schema.waitlistEntries.tenantId, tenant.id),
        eq(schema.waitlistEntries.status, "notified")
      )
    );

  return {
    rows: rows as WaitlistRow[],
    total: rows.length,
    filter,
    waitingCount: Number(waitingCount?.n ?? 0),
    notifiedCount: Number(notifiedCount?.n ?? 0),
  };
}
