import { PacotesClient } from "@/components/cadastro/PacotesClient";
import { listPackages, listProducts, listServices } from "@/lib/cadastros";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PacotesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [data, services, products] = await Promise.all([
    listPackages({ q: sp.q }),
    listServices({}),
    listProducts({}),
  ]);
  return (
    <PacotesClient
      rows={data.rows}
      total={data.total}
      q={data.q}
      services={services.rows.map((s) => ({ id: s.id, name: s.name }))}
      products={products.rows.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
