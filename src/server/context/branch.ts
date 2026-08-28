import { and, asc, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { readSession, setSessionCookie } from "../auth/session";
import {
  assertBranchSwitchAllowed,
  canUseConsolidatedView,
  CONSOLIDATED_BRANCH_SLUG,
} from "../members/access";
import type { AppSession, SessionBranch } from "../types";
import { requireSession } from "./tenant";

export async function listTenantBranches(tenantId: string): Promise<SessionBranch[]> {
  const db = createDb();
  const rows = await db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      slug: schema.branches.slug,
    })
    .from(schema.branches)
    .where(
      and(
        eq(schema.branches.tenantId, tenantId),
        eq(schema.branches.isActive, true),
        isNull(schema.branches.deletedAt)
      )
    )
    .orderBy(asc(schema.branches.name));

  return rows;
}

/** Unidade ativa da sessão (fallback: primeira branch do tenant). */
export async function requireBranchContext(): Promise<SessionBranch> {
  const session = await requireSession();
  if (session.branch?.id) return session.branch;

  const branches = await listTenantBranches(session.tenant.id);
  if (!branches.length) {
    throw new UnauthorizedError("Nenhuma unidade configurada");
  }

  return branches[0];
}

export async function resolveDefaultBranch(
  tenantId: string,
  membershipBranchId?: string | null
): Promise<SessionBranch | null> {
  const branches = await listTenantBranches(tenantId);
  if (membershipBranchId) {
    return branches.find((b) => b.id === membershipBranchId) ?? branches[0] ?? null;
  }
  return branches[0] ?? null;
}

export async function switchActiveBranch(branchSlug: string): Promise<AppSession> {
  const session = await requireSession();

  if (branchSlug === CONSOLIDATED_BRANCH_SLUG) {
    if (!canUseConsolidatedView(session)) {
      throw new ForbiddenError("Visão consolidada disponível apenas para donos");
    }
    const next: AppSession = {
      ...session,
      branch: null,
      branchView: "consolidated",
    };
    await setSessionCookie(next);
    return next;
  }

  const branches = await listTenantBranches(session.tenant.id);
  const branch = branches.find((b) => b.slug === branchSlug);
  if (!branch) {
    throw new ForbiddenError("Unidade não encontrada");
  }

  try {
    await assertBranchSwitchAllowed(session, branch.id);
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    throw new ForbiddenError("Seu acesso está restrito a outra unidade");
  }

  const next: AppSession = {
    ...session,
    branch,
    branchView: "unit",
  };
  await setSessionCookie(next);
  return next;
}
