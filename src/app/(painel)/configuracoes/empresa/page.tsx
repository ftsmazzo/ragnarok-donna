import { PageHeader } from "@/components/shell/PageHeader";
import { EmpresaForm } from "@/components/config/EmpresaForm";
import { getEmpresaForm } from "@/server/tenant/empresa";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  await requirePageAccess("/configuracoes/empresa");
  const initial = await getEmpresaForm();

  return (
    <>
      <PageHeader
        title="Dados da empresa"
        subtitle="Cadastro da unidade — a Donna usa estes dados nas conversas"
      />
      <section className="panel">
        <div className="panel-body">
          <EmpresaForm initial={initial} />
        </div>
      </section>
    </>
  );
}
