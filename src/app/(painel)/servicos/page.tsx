import { ServicosClient } from "@/components/cadastro/ServicosClient";
import { listServices } from "@/lib/cadastros";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ServicosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await listServices({ q: sp.q });
  return <ServicosClient rows={data.rows} total={data.total} q={data.q} />;
}
