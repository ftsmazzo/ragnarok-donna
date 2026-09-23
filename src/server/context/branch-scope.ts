import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { listTenantBranches } from "./branch";
import { requireSession } from "./tenant";

export type BranchScope = {
  branchId: string | null;
  multiBranch: boolean;
  /**
   * Legado: bloqueava unidade sem staff (Donna U02 pré-abertura).
   * Sempre false — unidade aberta mostra agenda vazia se ainda não houver equipe
   * vinculada à branch; não “trava” a operação.
   */
  isInactiveBranch: boolean;
};

export async function resolveBranchScope(): Promise<BranchScope> {
  const session = await requireSession();
  const branchId = session.branch?.id ?? null;
  const branches = await listTenantBranches(session.tenant.id);
  const multiBranch = branches.length > 1;

  return { branchId, multiBranch, isInactiveBranch: false };
}

/** Condição drizzle: restringe à unidade ativa quando o tenant é multi-unidade. */
export function branchWhere(scope: BranchScope, column: AnyColumn): SQL | undefined {
  if (!scope.multiBranch || !scope.branchId) return undefined;
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

/**
 * Catálogo (serviços): na unidade ativa mostra itens da unidade + compartilhados (branch_id null).
 * Visão consolidada / single-branch: sem filtro.
 * Não bloqueia unidade sem equipe (U02 pode cadastrar SPA antes de ter staff).
 */
export function catalogBranchWhere(scope: BranchScope, column: AnyColumn): SQL | undefined {
  if (!scope.multiBranch || !scope.branchId) return undefined;
  return or(isNull(column), eq(column, scope.branchId));
}

export function withCatalogBranchScope(
  scope: BranchScope,
  column: AnyColumn,
  base?: SQL
): SQL | undefined {
  const branch = catalogBranchWhere(scope, column);
  if (!branch) return base;
  return base ? and(base, branch) : branch;
}
