import { PacotesClient } from "@/components/cadastro/PacotesClient";
import { listPackages, listServices } from "@/lib/cadastros";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PacotesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [data, services] = await Promise.all([
    listPackages({ q: sp.q }),
    listServices({}),
  ]);
  return (
    <PacotesClient
      rows={data.rows}
      total={data.total}
      q={data.q}
      services={services.rows.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
