import { PageHeader } from "@/components/shell/PageHeader";
import { ContaForm } from "@/components/config/ContaForm";
import { requirePageAccess } from "@/server/permissions/page-access";

export default async function ContaPage() {
  const session = await requirePageAccess("/configuracoes/conta");

  return (
    <>
      <PageHeader
        title="Minha conta"
        subtitle="Altere sua senha de acesso ao painel Donna"
      />
      <ContaForm email={session.user.email} />
    </>
  );
}
