import { and, asc, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "../context/tenant";
import type { MemberRole } from "../types";

export type MemberListItem = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  branchId: string | null;
  branchName: string | null;
  staffId: string | null;
  staffName: string | null;
  createdAt: Date;
};

export type UnlinkedStaffItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  branchId: string | null;
  branchName: string | null;
};

export async function listTenantMembers(): Promise<MemberListItem[]> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const rows = await db
    .select({
      membershipId: schema.memberships.id,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
      branchId: schema.memberships.branchId,
      branchName: schema.branches.name,
      staffId: schema.staff.id,
      staffName: schema.staff.name,
      createdAt: schema.memberships.createdAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .leftJoin(schema.branches, eq(schema.memberships.branchId, schema.branches.id))
    .leftJoin(
      schema.staff,
      and(
        eq(schema.staff.userId, schema.users.id),
        eq(schema.staff.tenantId, tenant.id),
        isNull(schema.staff.deletedAt)
      )
    )
    .where(eq(schema.memberships.tenantId, tenant.id))
    .orderBy(asc(schema.users.name));

  return rows;
}

export async function listStaffWithoutUser(): Promise<UnlinkedStaffItem[]> {
  const tenant = await requireTenantContext();
  const db = createDb();

  return db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      email: schema.staff.email,
      phone: schema.staff.phone,
      branchId: schema.staff.branchId,
      branchName: schema.branches.name,
    })
    .from(schema.staff)
    .leftJoin(schema.branches, eq(schema.staff.branchId, schema.branches.id))
    .where(
      and(
        eq(schema.staff.tenantId, tenant.id),
        isNull(schema.staff.userId),
        isNull(schema.staff.deletedAt),
        eq(schema.staff.isActive, true)
      )
    )
    .orderBy(asc(schema.staff.name));
}

export async function getStaffForProvisioning(staffId: string): Promise<UnlinkedStaffItem | null> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [row] = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      email: schema.staff.email,
      phone: schema.staff.phone,
      branchId: schema.staff.branchId,
      branchName: schema.branches.name,
    })
    .from(schema.staff)
    .leftJoin(schema.branches, eq(schema.staff.branchId, schema.branches.id))
    .where(
      and(
        eq(schema.staff.id, staffId),
        eq(schema.staff.tenantId, tenant.id),
        isNull(schema.staff.userId),
        isNull(schema.staff.deletedAt),
        eq(schema.staff.isActive, true)
      )
    )
    .limit(1);

  return row ?? null;
}
