import { PacotesClient } from "@/components/cadastro/PacotesClient";
import { listPackages } from "@/lib/cadastros";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PacotesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await listPackages({ q: sp.q });
  return <PacotesClient rows={data.rows} total={data.total} q={data.q} />;
}
