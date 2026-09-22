import { ServicosClient } from "@/components/cadastro/ServicosClient";
import { listServices } from "@/lib/cadastros";
import { listTenantBranches } from "@/server/context/branch";
import { requireSession } from "@/server/context/tenant";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ServicosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const session = await requireSession();
  const [data, branches] = await Promise.all([
    listServices({ q: sp.q }),
    listTenantBranches(session.tenant.id),
  ]);
  return (
    <ServicosClient
      rows={data.rows}
      total={data.total}
      q={data.q}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      defaultBranchId={session.branch?.id ?? null}
      multiBranch={branches.length > 1}
    />
  );
}
