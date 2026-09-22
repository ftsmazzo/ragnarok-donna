import { PageHeader } from "@/components/shell/PageHeader";
import { AgenteConfigForm } from "@/components/config/AgenteConfigForm";
import { WhatsAppConnectPanel } from "@/components/conversas/WhatsAppConnectPanel";
import { getAgentConfig } from "@/server/agent/agent-config";
import { getWhatsAppConnection } from "@/server/agent/connection";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function AgenteConfigPage() {
  await requirePageAccess("/configuracoes/agente");
  const [config, whatsApp] = await Promise.all([getAgentConfig(), getWhatsAppConnection()]);

  return (
    <>
      <PageHeader
        title="Agente da barbearia"
        subtitle="WhatsApp da unidade, personalidade e alerta de atendimento humano"
      />

      <section className="panel" style={{ background: "transparent", border: "none", boxShadow: "none" }}>
        <div className="panel-body agent-config-stack" style={{ padding: 0 }}>
          <WhatsAppConnectPanel initial={whatsApp} variant="agente" />
          <AgenteConfigForm initial={config} />
        </div>
      </section>
    </>
  );
}
