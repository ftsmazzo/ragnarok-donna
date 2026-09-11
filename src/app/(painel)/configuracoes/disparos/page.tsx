import { PageHeader } from "@/components/shell/PageHeader";
import { DisparosConfigForm } from "@/components/config/DisparosConfigForm";
import { getOutreachSettings } from "@/server/outreach/settings";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function DisparosConfigPage() {
  await requirePageAccess("/configuracoes/disparos");
  const settings = await getOutreachSettings();

  return (
    <>
      <PageHeader
        title="Disparos WhatsApp"
        subtitle="Regras da casa: confirmação, retorno, blast e agenda vazia — por unidade"
      />
      <section className="panel" style={{ background: "transparent", border: "none", boxShadow: "none" }}>
        <div className="panel-body" style={{ padding: 0 }}>
          <DisparosConfigForm initial={settings} />
        </div>
      </section>
    </>
  );
}
