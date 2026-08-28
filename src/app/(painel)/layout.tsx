export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/shell/AppShell";
import { createDb, schema } from "@/db";
import { resolveTenantBrand } from "@/lib/brand";
import { listUserOrganizations } from "@/server/auth/organizations";
import { listTenantBranches } from "@/server/context/branch";
import { requireSession } from "@/server/context/tenant";
import { ensureDonnaImportIfEmpty } from "@/server/tenant/donna-import";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  void ensureDonnaImportIfEmpty(session.tenant.id, session.tenant.slug);
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

  const [organizations, branches] = await Promise.all([
    listUserOrganizations(),
    listTenantBranches(session.tenant.id),
  ]);

  return (
    <Suspense fallback={<div className="app-shell" />}>
      <AppShell
        session={{
          userName: session.user.name,
          tenantName: brand.displayName,
          tenantSlug: session.tenant.slug,
          branchName: session.branch?.name ?? branches[0]?.name ?? null,
          branchSlug: session.branch?.slug ?? branches[0]?.slug ?? null,
          role: session.role,
          staffId: session.staffId,
          brandLogoSrc: brand.logoSrc,
          brandTagline: brand.tagline,
          organizations,
          branches: branches.map((b) => ({ slug: b.slug, name: b.name })),
        }}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
