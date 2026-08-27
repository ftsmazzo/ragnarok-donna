import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { buildOperationalAlerts } from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SEV_LABEL = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Info",
} as const;

export default async function AlertasPage() {
  await requirePageAccess("/alertas");
  const report = await buildOperationalAlerts();

  return (
    <>
      <PageHeader
        title="Alertas operacionais"
        subtitle={`Semana ${report.weekFrom} → ${report.weekTo} · o que exige ação agora`}
        actions={
          <Link href="/relatorios" className="btn btn-outline">
            Painel gerencial
          </Link>
        }
      />

      <SummaryCards
        cards={[
          { label: "Críticos", value: report.summary.critical },
          { label: "Atenção", value: report.summary.warning },
          { label: "Info", value: report.summary.info },
          {
            label: "Cancel./no-show",
            value: report.summary.cancellationsWeek,
            hint: `${report.summary.cancelRatePct}% da semana`,
          },
        ]}
      />

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-toolbar">
          <strong>Fila de alertas</strong>
          <span className="muted-note">{report.alerts.length} item(ns)</span>
        </div>
        <div className="panel-body">
          {report.alerts.length === 0 ? (
            <div className="empty-decision">
              Nada crítico nesta semana. Estoque ok, cancelamentos sob controle e sem surpresas
              de retorno.
            </div>
          ) : (
            <ul className="alert-list">
              {report.alerts.map((a) => (
                <li key={a.id} className={`alert-item alert-item--${a.severity}`}>
                  <div className="alert-item-main">
                    <span className={`badge alert-sev alert-sev--${a.severity}`}>
                      {SEV_LABEL[a.severity]}
                    </span>
                    <div>
                      <strong>{a.title}</strong>
                      <p className="muted-note">{a.detail}</p>
                      <span className="muted-note">{a.periodLabel}</span>
                    </div>
                  </div>
                  <Link href={a.href} className="btn btn-outline btn-sm">
                    Abrir
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {(report.returnedClients.length > 0 || report.renewalClients.length > 0) && (
        <div className="dash-grid" style={{ marginTop: 16 }}>
          {report.returnedClients.length > 0 ? (
            <section className="panel">
              <div className="panel-toolbar panel-toolbar-split">
                <strong>Perdidos que voltaram</strong>
                <Link href="/relatorios/perfil?tab=retorno" className="btn btn-ghost btn-sm">
                  Perfil
                </Link>
              </div>
              <div className="panel-body">
                <ul className="simple-list">
                  {report.returnedClients.map((c) => (
                    <li key={c.clientId}>
                      <Link href={`/clientes?id=${c.clientId}`}>{c.clientName}</Link>
                      <span className="muted-note">sumiu {c.gapDays}d</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
          {report.renewalClients.length > 0 ? (
            <section className="panel">
              <div className="panel-toolbar panel-toolbar-split">
                <strong>Renovações da semana</strong>
                <Link href="/relatorios/perfil?tab=recorrencia" className="btn btn-ghost btn-sm">
                  Perfil
                </Link>
              </div>
              <div className="panel-body">
                <ul className="simple-list">
                  {report.renewalClients.map((c) => (
                    <li key={c.clientId}>
                      <Link href={`/clientes?id=${c.clientId}`}>{c.clientName}</Link>
                      <span className="muted-note">após {c.gapDays}d</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
