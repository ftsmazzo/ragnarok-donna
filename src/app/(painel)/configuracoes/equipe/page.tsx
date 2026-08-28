import { PageHeader } from "@/components/shell/PageHeader";
import { EquipeView } from "@/components/config/EquipeView";
import { listTenantBranches } from "@/server/context/branch";
import { requireTenantContext } from "@/server/context/tenant";
import { listStaffWithoutUser, listTenantMembers } from "@/server/members";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  await requirePageAccess("/configuracoes/equipe");
  const tenant = await requireTenantContext();
  const [members, unlinkedStaff, branches] = await Promise.all([
    listTenantMembers(),
    listStaffWithoutUser(),
    listTenantBranches(tenant.id),
  ]);

  const hasEmailConfig = Boolean(process.env.RESEND_API_KEY?.trim());

  return (
    <>
      <PageHeader
        title="Equipe de acesso"
        subtitle={`${members.length} usuário(s) · ${unlinkedStaff.length} profissional(is) sem login`}
      />

      <section className="panel">
        <div className="panel-body">
          <EquipeView
            members={members}
            unlinkedStaff={unlinkedStaff}
            branches={branches.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
            hasEmailConfig={hasEmailConfig}
          />
        </div>
      </section>
    </>
  );
}
