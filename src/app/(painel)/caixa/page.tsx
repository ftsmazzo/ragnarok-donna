import { CaixaView } from "@/components/caixa/CaixaView";
import { getCashDay, getCashPermissions } from "@/server/finance";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ date?: string }>;
};

export default async function CaixaPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/caixa", sp);

  const [data, permissions] = await Promise.all([
    getCashDay(sp.date),
    getCashPermissions(),
  ]);

  return <CaixaView data={data} permissions={permissions} />;
}
