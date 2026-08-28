import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { ForbiddenError } from "../errors";
import { isOwnerRole } from "../permissions/roles";
import type { AppSession, MemberRole } from "../types";

export const CONSOLIDATED_BRANCH_SLUG = "_consolidado";

/** Papéis que devem ficar presos a uma unidade — ver permissions/roles.roleRequiresBranch */

export async function getMembershipBranchId(
  userId: string,
  tenantId: string
): Promise<string | null> {
  const db = createDb();
  const [row] = await db
    .select({ branchId: schema.memberships.branchId })
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, tenantId))
    )
    .limit(1);
  return row?.branchId ?? null;
}

/** Dono/admin sem branch_id → todas as unidades + consolidado. */
export function canUseConsolidatedView(session: AppSession): boolean {
  return isOwnerRole(session.role);
}

export function canSwitchBranches(session: AppSession, membershipBranchId: string | null): boolean {
  if (canUseConsolidatedView(session) && !membershipBranchId) return true;
  return false;
}

export async function assertBranchSwitchAllowed(
  session: AppSession,
  targetBranchId: string
): Promise<void> {
  const assigned = await getMembershipBranchId(session.user.id, session.tenant.id);
  if (assigned && assigned !== targetBranchId) {
    throw new ForbiddenError("Seu acesso está restrito a outra unidade");
  }
}
