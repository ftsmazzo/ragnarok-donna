import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { readSession } from "../auth/session";
import type { AppSession, MemberRole, TenantContext } from "../types";

/** Sessão obrigatória — use em layouts, pages e services. */
export async function requireSession(): Promise<AppSession> {
  const session = await readSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

/** Tenant da sessão + metadados (timezone, moeda). */
export async function requireTenantContext(): Promise<TenantContext> {
  const session = await requireSession();
  const db = createDb();

  const [tenant] = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
      timezone: schema.tenants.timezone,
      currency: schema.tenants.currency,
      status: schema.tenants.status,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, session.tenant.id))
    .limit(1);

  if (!tenant) {
    throw new UnauthorizedError("Tenant não encontrado");
  }

  if (tenant.status !== "active" && tenant.status !== "trialing") {
    throw new ForbiddenError("Unidade inativa");
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    timezone: tenant.timezone,
    currency: tenant.currency,
  };
}

/** Papéis com visão gerencial (cancelamentos, acertos, etc.) */
export function isManagementRole(role: MemberRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/** Guarda mínima de papéis — expandir conforme sprints. */
export function requireRole(session: AppSession, allowed: MemberRole[]): void {
  if (!allowed.includes(session.role)) {
    throw new ForbiddenError();
  }
}
