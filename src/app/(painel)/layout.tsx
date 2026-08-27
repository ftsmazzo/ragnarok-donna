export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { AppShell } from "@/components/shell/AppShell";
import { createDb, schema } from "@/db";
import { resolveTenantBrand } from "@/lib/brand";
import { requireSession } from "@/server/context/tenant";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const db = createDb();
  const [tenantRow] = await db
    .select({
      name: schema.tenants.name,
      slug: schema.tenants.slug,
      settings: schema.tenants.settings,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, session.tenant.id))
    .limit(1);

  const brand = resolveTenantBrand({
    tenantName: tenantRow?.name ?? session.tenant.name,
    tenantSlug: tenantRow?.slug ?? session.tenant.slug,
    settings: tenantRow?.settings,
  });

  return (
    <AppShell
      session={{
        userName: session.user.name,
        tenantName: brand.displayName,
        tenantSlug: session.tenant.slug,
        role: session.role,
        staffId: session.staffId,
        brandLogoSrc: brand.logoSrc,
        brandTagline: brand.tagline,
      }}
    >
      {children}
    </AppShell>
  );
}
