import { InicioContent } from "@/components/inicio/InicioContent";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ acesso?: string; aviso?: string }>;
};

export default async function InicioPage({ searchParams }: Props) {
  const session = await requirePageAccess("/inicio");
  return <InicioContent session={session} searchParams={searchParams} />;
}
