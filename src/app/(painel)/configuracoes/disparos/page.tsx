import { PageHeader } from "@/components/shell/PageHeader";
import { DisparosConfigForm } from "@/components/config/DisparosConfigForm";
import { OutreachMetricsPanel } from "@/components/config/OutreachMetricsPanel";
import { getOutreachMetrics } from "@/server/outreach/metrics";
import { getOutreachSettings } from "@/server/outreach/settings";
import { requirePageAccess } from "@/server/permissions/page-access";
import { requireTenantContext } from "@/server/context/tenant";

export const dynamic = "force-dynamic";

export default async function DisparosConfigPage() {
  await requirePageAccess("/configuracoes/disparos");
  const tenant = await requireTenantContext();
  const [settings, metrics] = await Promise.all([
    getOutreachSettings(),
    getOutreachMetrics(tenant.id),
  ]);

  return (
    <>
      <PageHeader
        title="Disparos WhatsApp"
        subtitle="Anti-ban: variantes, janela horária e dry-run antes de liberar envio real"
      />
      <OutreachMetricsPanel metrics={metrics} />
      <section className="panel" style={{ background: "transparent", border: "none", boxShadow: "none" }}>
        <div className="panel-body" style={{ padding: 0 }}>
          <DisparosConfigForm initial={settings} />
        </div>
      </section>
    </>
  );
}
