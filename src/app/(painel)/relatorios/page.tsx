import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import {
  PaymentMixDonut,
  RankingBarChart,
  RevenueAreaChart,
  StatusBarChart,
} from "@/components/relatorio/charts";
import { formatMoney } from "@/lib/format";
import { getManagementDashboard } from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";
import { canAccessRoute } from "@/server/permissions/routes";
import { requireSession } from "@/server/context/tenant";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

const LINKS = [
  {
    href: "/relatorios/agendamentos",
    title: "1 · Agendamentos",
    desc: "Status, no-show e volume por período",
  },
  {
    href: "/relatorios/financeiro",
    title: "2 · Financeiro",
    desc: "Receita, mix de pagamento e caixa",
  },
  {
    href: "/relatorios/comandas",
    title: "3 · Comandas",
    desc: "Ticket, volume e status",
  },
  {
    href: "/relatorios/estoque",
    title: "4 · Estoque",
    desc: "Saldo, mínimo e vendas de produto",
  },
  {
    href: "/relatorios/perfil",
    title: "Perfil / recompra",
    desc: "Quem abordar esta semana",
  },
  {
    href: "/comissoes",
    title: "Comissões",
    desc: "Sintético, ranking e analítico",
  },
] as const;

export default async function RelatoriosHubPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios", sp);
  const session = await requireSession();
  const dash = await getManagementDashboard({ from: sp.from, to: sp.to });

  const visibleLinks = LINKS.filter((l) =>
    canAccessRoute(l.href, session.role, { staffId: session.staffId })
  );

  const delta =
    dash.revenueDeltaPct == null
      ? "vs período anterior"
      : `${dash.revenueDeltaPct > 0 ? "+" : ""}${dash.revenueDeltaPct}% vs período anterior`;

  return (
    <>
      <PageHeader
        title="Painel gerencial"
        subtitle={`Visão do negócio · ${dash.from} → ${dash.to}`}
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar">
          <RelatorioFilters action="/relatorios" from={dash.from} to={dash.to} />
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
                  hint: `${dash.closedOrders} comanda(s) fechada(s)`,
                },
              ]
            : []),
          {
            label: "Agendamentos",
            value: dash.appointmentsTotal.toLocaleString("pt-BR"),
            hint: `No-show ${dash.noShowRatePct}% · cancel. ${dash.cancelRatePct}%`,
          },
          {
            label: "Ação da semana",
            value: dash.weeklyTips.length,
            hint: "insights abaixo",
          },
        ]}
      />

      {dash.canSeeFinance ? (
        <div className="dash-grid" style={{ marginTop: 12 }}>
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Receita no tempo</strong>
            </div>
            <div className="panel-body">
              <RevenueAreaChart data={dash.revenueSeries} />
            </div>
          </section>
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Mix de pagamento</strong>
            </div>
            <div className="panel-body">
              <PaymentMixDonut data={dash.paymentMix} />
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
            <StatusBarChart data={dash.appointmentStatus} />
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
