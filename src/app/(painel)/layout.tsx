export const dynamic = "force-dynamic";

import { AppShell } from "@/components/shell/AppShell";
import { requireSession } from "@/server/context/tenant";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <AppShell
      session={{
        userName: session.user.name,
        tenantName: session.tenant.name,
        tenantSlug: session.tenant.slug,
        role: session.role,
        staffId: session.staffId,
      }}
    >
      {children}
    </AppShell>
  );
}
