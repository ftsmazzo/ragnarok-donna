import { PageHeader } from "@/components/shell/PageHeader";
import { EquipeView } from "@/components/config/EquipeView";
import { listStaffWithoutUser, listTenantMembers } from "@/server/members";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  await requirePageAccess("/configuracoes/equipe");
  const [members, unlinkedStaff] = await Promise.all([
    listTenantMembers(),
    listStaffWithoutUser(),
  ]);

  return (
    <>
      <PageHeader
        title="Equipe de acesso"
        subtitle={`${members.length} usuário(s) com acesso a esta unidade`}
      />

      <section className="panel">
        <div className="panel-body">
          <EquipeView members={members} unlinkedStaff={unlinkedStaff} />
        </div>
      </section>
    </>
  );
}
