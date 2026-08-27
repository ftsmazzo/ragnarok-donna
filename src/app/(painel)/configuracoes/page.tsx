import { StubPage } from "@/components/shell/StubPage";
import { requirePageAccess } from "@/server/permissions/page-access";

export default async function Page() {
  await requirePageAccess("/configuracoes");
  return <StubPage title="Parâmetros" subtitle="Tolerância, pontos, funcionamento" />;
}
