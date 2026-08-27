import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import {
  PaymentMixDonut,
  RankingBarChart,
  RevenueAreaChart,
  StatusBarChart,
} from "@/components/relatorio/charts";
import { formatMoney } from "@/lib/format";
import { resolveReportPeriod } from "@/lib/datetime";
import {
  buildOperationalAlerts,
  getManagementDashboard,
} from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";
import { canAccessRoute } from "@/server/permissions/routes";
import { requireSession } from "@/server/context/tenant";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
};

const LINKS = [
  { href: "/alertas", title: "Alertas", desc: "Estoque, cancelamentos e retornos" },
  { href: "/relatorios/agendamentos", title: "Agendamentos", desc: "Status, no-show e volume" },
  { href: "/relatorios/financeiro", title: "Financeiro", desc: "Receita, mix e caixa" },
  { href: "/relatorios/comandas", title: "Comandas", desc: "Ticket, volume e status" },
  { href: "/relatorios/estoque", title: "Estoque", desc: "Saldo, mínimo e vendas" },
  { href: "/relatorios/perfil", title: "Perfil do cliente", desc: "Quem abordar esta semana" },
  { href: "/comissoes", title: "Comissões", desc: "Sintético, vales e analítico" },
  { href: "/relatorios/fluxo", title: "Fluxo de caixa", desc: "Movimentado e disponível" },
  { href: "/contas", title: "Contas", desc: "A pagar, crédito e saídas" },
] as const;

export default async function RelatoriosHubPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios", sp);
  const session = await requireSession();
  const resolved = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const [dash, alerts] = await Promise.all([
    getManagementDashboard({ from: resolved.from, to: resolved.to }),
    canAccessRoute("/alertas", session.role, { staffId: session.staffId })
      ? buildOperationalAlerts()
      : Promise.resolve(null),
  ]);

  const visibleLinks = LINKS.filter((l) =>
    canAccessRoute(l.href, session.role, { staffId: session.staffId })
  );

  const delta =
    dash.revenueDeltaPct == null
      ? "vs período anterior"
      : `${dash.revenueDeltaPct > 0 ? "+" : ""}${dash.revenueDeltaPct}% vs período anterior`;

  const periodLabel =
    resolved.period === "week"
      ? "Esta semana"
      : resolved.period === "month"
        ? "Este mês"
        : "Personalizado";

  return (
    <>
      <PageHeader
        title="Painel gerencial"
        subtitle={`${periodLabel} · ${dash.from} → ${dash.to}`}
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/relatorios"
            period={resolved.period}
            from={resolved.from}
            to={resolved.to}
          />
          <RelatorioFilters
            action="/relatorios"
            from={dash.from}
            to={dash.to}
            hidden={{ period: "custom" }}
          />
        </div>
      </section>

      <SummaryCards
        cards={[
          ...(dash.canSeeFinance
            ? [
                {
                  label: "Receita (pagamentos)",
                  value: formatMoney(dash.revenueCents),
                  hint: delta,
                },
                {
                  label: "Ticket médio",
                  value: formatMoney(dash.ticketAvgCents),
                  hint:
                    dash.closedOrders > 0
                      ? `${dash.closedOrders} comanda(s) fechada(s)`
                      : "Sem comandas fechadas — feche no Caixa",
                },
              ]
            : []),
          {
            label: "Agendamentos",
            value: dash.appointmentsTotal.toLocaleString("pt-BR"),
            hint: `No-show ${dash.noShowRatePct}% · cancel. ${dash.cancelRatePct}%`,
          },
          {
            label: "Estoque baixo",
            value: alerts
              ? (alerts.summary.lowStockShop + alerts.summary.lowStockBar).toLocaleString("pt-BR")
              : "—",
            hint: alerts
              ? `Loja ${alerts.summary.lowStockShop} · Bar ${alerts.summary.lowStockBar}`
              : "sem acesso a alertas",
          },
        ]}
      />

      {alerts && alerts.alerts.length > 0 ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-toolbar panel-toolbar-split">
            <strong>Decisões desta semana</strong>
            <Link href="/alertas" className="btn btn-outline btn-sm">
              Centro de alertas
            </Link>
          </div>
          <div className="panel-body">
            <ul className="alert-list">
              {alerts.alerts.slice(0, 4).map((a) => (
                <li key={a.id} className={`alert-item alert-item--${a.severity}`}>
                  <div className="alert-item-main">
                    <div>
                      <strong>{a.title}</strong>
                      <p className="muted-note">{a.detail}</p>
                    </div>
                  </div>
                  <Link href={a.href} className="btn btn-outline btn-sm">
                    Abrir
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {dash.canSeeFinance ? (
        <div className="dash-grid" style={{ marginTop: 12 }}>
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Receita no tempo</strong>
            </div>
            <div className="panel-body">
              {dash.revenueCents <= 0 ? (
                <div className="empty-decision">
                  Sem pagamentos neste período. Feche comandas no Caixa para popular o gráfico.
                </div>
              ) : (
                <RevenueAreaChart data={dash.revenueSeries} />
              )}
            </div>
          </section>
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Mix de pagamento</strong>
            </div>
            <div className="panel-body">
              {dash.paymentMix.length === 0 ? (
                <div className="empty-decision">Sem mix de pagamento no período.</div>
              ) : (
                <PaymentMixDonut data={dash.paymentMix} />
              )}
            </div>
          </section>
        </div>
      ) : null}

      <div className="dash-grid" style={{ marginTop: 12 }}>
        <section className="panel dash-panel">
          <div className="panel-toolbar">
            <strong>Agenda por status</strong>
          </div>
          <div className="panel-body">
            {dash.appointmentsTotal <= 0 ? (
              <div className="empty-decision">Sem agendamentos no período.</div>
            ) : (
              <StatusBarChart data={dash.appointmentStatus} />
            )}
          </div>
        </section>
        {dash.canSeeFinance ? (
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Top serviços (R$)</strong>
            </div>
            <div className="panel-body">
              <RankingBarChart data={dash.topServices} />
            </div>
          </section>
        ) : null}
      </div>

      {dash.canSeeFinance ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-toolbar">
            <strong>Top profissionais (faturamento em itens)</strong>
          </div>
          <div className="panel-body">
            <RankingBarChart data={dash.topStaff} />
          </div>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-toolbar">
          <strong>O que fazer esta semana</strong>
        </div>
        <div className="panel-body">
          <ul className="insight-tips">
            {dash.weeklyTips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {canAccessRoute("/relatorios/perfil", session.role, { staffId: session.staffId }) ? (
            <Link href="/relatorios/perfil" className="btn btn-outline btn-sm">
              Abrir recompra / perfil
            </Link>
          ) : null}
        </div>
      </section>

      <h2 className="section-title">Detalhamentos</h2>
      <section className="overview-grid overview-grid-cadastros">
        {visibleLinks.map((r) => (
          <Link key={r.href} href={r.href} className="overview-card">
            <span className="overview-label">{r.title}</span>
            <small>{r.desc}</small>
          </Link>
        ))}
      </section>
    </>
  );
}
