import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { getDb } from "./db";

const DEFAULT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "ragnaroks";

export async function getDefaultTenant() {
  const db = getDb();
  const [tenant] = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, DEFAULT_SLUG))
    .limit(1);

  if (!tenant) {
    throw new Error(`Tenant não encontrado: ${DEFAULT_SLUG}`);
  }
  return tenant;
}
