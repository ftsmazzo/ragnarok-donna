import { and, count, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { listTenantBranches } from "./branch";
import { requireSession } from "./tenant";

export type BranchScope = {
  branchId: string | null;
  multiBranch: boolean;
  /** Unidade cadastrada mas sem equipe/dados (ex.: Donna U02). */
  isInactiveBranch: boolean;
};

export async function resolveBranchScope(): Promise<BranchScope> {
  const session = await requireSession();
  const branchId = session.branch?.id ?? null;
  const branches = await listTenantBranches(session.tenant.id);
  const multiBranch = branches.length > 1;

  if (!multiBranch || !branchId) {
    return { branchId, multiBranch, isInactiveBranch: false };
  }

  const db = createDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, session.tenant.id),
        eq(schema.staff.branchId, branchId),
        isNull(schema.staff.deletedAt)
      )
    );

  return {
    branchId,
    multiBranch,
    isInactiveBranch: (row?.n ?? 0) === 0,
  };
}

/** Condição drizzle: restringe à unidade ativa quando o tenant é multi-unidade. */
export function branchWhere(scope: BranchScope, column: AnyColumn): SQL | undefined {
  if (!scope.multiBranch || !scope.branchId) return undefined;
  if (scope.isInactiveBranch) return sql`false`;
  return eq(column, scope.branchId);
}

/** Mescla condição de unidade em um `and(...)` existente. */
export function withBranchScope(
  scope: BranchScope,
  column: AnyColumn,
  base?: SQL
): SQL | undefined {
  const branch = branchWhere(scope, column);
  if (!branch) return base;
  return base ? and(base, branch) : branch;
}
