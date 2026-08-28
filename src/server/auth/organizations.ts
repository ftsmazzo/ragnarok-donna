import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireSession } from "../context/tenant";
import type { TenantPickOption } from "../types";

/** Organizações (tenants) que o usuário logado pode acessar. */
export async function listUserOrganizations(): Promise<TenantPickOption[]> {
  const session = await requireSession();
  const db = createDb();

  const rows = await db
    .select({
      slug: schema.tenants.slug,
      name: schema.tenants.name,
      status: schema.tenants.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
    .where(
      and(
        eq(schema.memberships.userId, session.user.id),
        isNull(schema.tenants.deletedAt)
      )
    );

  return rows
    .filter((r) => r.status === "active" || r.status === "trialing")
    .map((r) => ({ slug: r.slug, name: r.name }));
}
