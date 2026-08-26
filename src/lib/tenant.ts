/**
 * @deprecated Use requireTenantContext() from @/server/context/tenant em código novo.
 * Mantido para lib/* existentes durante a migração Sprint 0.
 */
import { requireTenantContext } from "@/server/context/tenant";

export async function getDefaultTenant() {
  const ctx = await requireTenantContext();
  return { id: ctx.id, name: ctx.name, slug: ctx.slug };
}
