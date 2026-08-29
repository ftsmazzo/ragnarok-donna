import { ProdutosClient } from "@/components/cadastro/ProdutosClient";
import { listProducts } from "@/lib/cadastros";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ProdutosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await listProducts({ q: sp.q });
  return <ProdutosClient rows={data.rows} total={data.total} q={data.q} />;
}
