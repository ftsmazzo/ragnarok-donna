import { PageHeader } from "@/components/shell/PageHeader";
import { AgenteConfigForm } from "@/components/config/AgenteConfigForm";
import { getAgentConfig } from "@/server/agent/agent-config";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function AgenteConfigPage() {
  await requirePageAccess("/configuracoes/agente");
  const config = await getAgentConfig();

  return (
    <>
      <PageHeader
        title="Agente (Donna)"
        subtitle="Tom de voz, persona e alerta de atendimento humano — por unidade"
      />

      <section className="panel" style={{ background: "transparent", border: "none", boxShadow: "none" }}>
        <div className="panel-body" style={{ padding: 0 }}>
          <AgenteConfigForm initial={config} />
        </div>
      </section>
    </>
  );
}
