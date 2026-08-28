import { and, asc, count, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { NotFoundError } from "../errors";
import { resolveBranchScope, withBranchScope } from "../context/branch-scope";
import { requireTenantContext } from "../context/tenant";

export type StaffFilter = "ativos" | "removidos" | "todos";

export type StaffListItem = {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  color: string | null;
  branchId: string | null;
  isBookable: boolean;
  isActive: boolean;
  defaultCommissionBps: number | null;
  scheduleSlots: number;
  deletedAt: Date | null;
};

export type StaffScheduleSlot = {
  id: string;
  weekday: number;
  slotIndex: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type StaffDetail = StaffListItem & {
  createdAt: Date;
  updatedAt: Date;
  externalSource: string | null;
  schedules: StaffScheduleSlot[];
};

function staffFilterWhere(tenantId: string, filter: StaffFilter) {
  const base = eq(schema.staff.tenantId, tenantId);
  if (filter === "ativos") {
    return and(base, eq(schema.staff.isActive, true), isNull(schema.staff.deletedAt));
  }
  if (filter === "removidos") {
    return and(
      base,
      or(eq(schema.staff.isActive, false), isNotNull(schema.staff.deletedAt))
    );
  }
  return base;
}

export async function listStaffMembers(opts: { q?: string; filter?: StaffFilter }) {
  const tenant = await requireTenantContext();
  const scope = await resolveBranchScope();
  const db = createDb();
  const filter = opts.filter ?? "ativos";
  const q = opts.q?.trim();

  if (scope.isInactiveBranch) {
    return { rows: [], total: 0, filter, q: q ?? "" };
  }

  let where = withBranchScope(scope, schema.staff.branchId, staffFilterWhere(tenant.id, filter));
  if (q) {
    where = and(
      where,
      or(
        ilike(schema.staff.name, `%${q}%`),
        ilike(schema.staff.nickname, `%${q}%`),
        ilike(schema.staff.phone, `%${q}%`),
        ilike(schema.staff.email, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      nickname: schema.staff.nickname,
      phone: schema.staff.phone,
      email: schema.staff.email,
      avatarUrl: schema.staff.avatarUrl,
      color: schema.staff.color,
      branchId: schema.staff.branchId,
      isBookable: schema.staff.isBookable,
      isActive: schema.staff.isActive,
      defaultCommissionBps: schema.staff.defaultCommissionBps,
      deletedAt: schema.staff.deletedAt,
      scheduleSlots: sql<number>`(
        select count(*)::int from ${schema.staffSchedules}
        where ${schema.staffSchedules.staffId} = ${schema.staff.id}
          and ${schema.staffSchedules.isActive} = true
      )`.as("schedule_slots"),
    })
    .from(schema.staff)
    .where(where)
    .orderBy(asc(schema.staff.name));

  return {
    rows: rows.map((r) => ({ ...r, scheduleSlots: Number(r.scheduleSlots) })),
    total: rows.length,
    filter,
    q: q ?? "",
  };
}

export async function getStaffMember(staffId: string): Promise<StaffDetail> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [row] = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      nickname: schema.staff.nickname,
      phone: schema.staff.phone,
      email: schema.staff.email,
      avatarUrl: schema.staff.avatarUrl,
      color: schema.staff.color,
      branchId: schema.staff.branchId,
      isBookable: schema.staff.isBookable,
      isActive: schema.staff.isActive,
      defaultCommissionBps: schema.staff.defaultCommissionBps,
      deletedAt: schema.staff.deletedAt,
      createdAt: schema.staff.createdAt,
      updatedAt: schema.staff.updatedAt,
      externalSource: schema.staff.externalSource,
      scheduleSlots: sql<number>`(
        select count(*)::int from ${schema.staffSchedules}
        where ${schema.staffSchedules.staffId} = ${schema.staff.id}
          and ${schema.staffSchedules.isActive} = true
      )`.as("schedule_slots"),
    })
    .from(schema.staff)
    .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Profissional não encontrado");
  }

  const schedules = await db
    .select({
      id: schema.staffSchedules.id,
      weekday: schema.staffSchedules.weekday,
      slotIndex: schema.staffSchedules.slotIndex,
      startTime: schema.staffSchedules.startTime,
      endTime: schema.staffSchedules.endTime,
      isActive: schema.staffSchedules.isActive,
    })
    .from(schema.staffSchedules)
    .where(
      and(
        eq(schema.staffSchedules.staffId, staffId),
        eq(schema.staffSchedules.tenantId, tenant.id),
        eq(schema.staffSchedules.isActive, true)
      )
    )
    .orderBy(asc(schema.staffSchedules.weekday), asc(schema.staffSchedules.slotIndex));

  return {
    ...row,
    scheduleSlots: Number(row.scheduleSlots),
    schedules: schedules.map((s) => ({
      ...s,
      startTime: String(s.startTime).slice(0, 5),
      endTime: String(s.endTime).slice(0, 5),
    })),
  };
}

export async function getStaffStats(staffId: string) {
  const tenant = await requireTenantContext();
  const db = createDb();
  await getStaffMember(staffId);

  const [[appts], [orders]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.staffId, staffId),
          eq(schema.appointments.tenantId, tenant.id),
          isNull(schema.appointments.deletedAt)
        )
      ),
    db
      .select({ n: count() })
      .from(schema.orderItems)
      .where(
        and(eq(schema.orderItems.staffId, staffId), eq(schema.orderItems.tenantId, tenant.id))
      ),
  ]);

  return {
    appointmentsTotal: Number(appts?.n ?? 0),
    orderItemsTotal: Number(orders?.n ?? 0),
  };
}
