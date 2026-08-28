import { ConsolidatedOverviewPanel } from "@/components/inicio/ConsolidatedOverviewPanel";
import { DonnaImportBanner } from "@/components/inicio/DonnaImportBanner";
import { BranchInaugurationBanner } from "@/components/inicio/BranchInaugurationBanner";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import {
  PaymentMixDonut,
  RevenueAreaChart,
  StatusBarChart,
} from "@/components/relatorio/charts";
import { getTenantOverview } from "@/lib/cadastros";
import { formatDateLabelSp, monthStartSp, todaySp, weekBoundsSp } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import { canAccessRoute } from "@/server/permissions/routes";
import { isManagementRole } from "@/server/permissions/roles";
import {
  buildOperationalAlerts,
  getManagementDashboard,
  getWeeklyInsights,
} from "@/server/insights";
import { getConsolidatedOverview } from "@/server/insights/consolidated";
import { getDonnaImportStatus } from "@/server/tenant/donna-import";
import { profissionaisHref } from "@/components/shell/nav";
import type { AppSession } from "@/server/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

type LinkItem = { href: string; label: string; hint?: string };

function filterLinks(session: AppSession, links: LinkItem[]): LinkItem[] {
  return links.filter((l) =>
    canAccessRoute(l.href, session.role, { staffId: session.staffId })
  );
}

type Props = {
  session: AppSession;
  searchParams: Promise<{ acesso?: string; aviso?: string }>;
};

export async function InicioContent({ session, searchParams }: Props) {
  const sp = await searchParams;
  const showInsights = isManagementRole(session.role);
  const canFinance = canAccessRoute("/relatorios/financeiro", session.role, {
    staffId: session.staffId,
  });
  const canReports = canAccessRoute("/relatorios", session.role, {
    staffId: session.staffId,
  });
  const canAlerts = canAccessRoute("/alertas", session.role, { staffId: session.staffId });

  const today = todaySp();
  const monthFrom = monthStartSp();
  const week = weekBoundsSp(today);
  const weekTo = today < week.to ? today : week.to;

  const isConsolidated = session.branchView === "consolidated";

  const [o, weekly, dashMonth, dashWeek, alerts, donnaImport, consolidated] =
    await Promise.all([
    getTenantOverview(),
    showInsights && !isConsolidated ? getWeeklyInsights() : Promise.resolve(null),
    canReports && !isConsolidated
      ? getManagementDashboard({ from: monthFrom, to: today })
      : Promise.resolve(null),
    canReports && !isConsolidated
      ? getManagementDashboard({ from: week.from, to: weekTo })
      : Promise.resolve(null),
    canAlerts && !isConsolidated ? buildOperationalAlerts() : Promise.resolve(null),
    session.tenant.slug === "donna-elegant" && isManagementRole(session.role)
      ? getDonnaImportStatus(session.tenant.id)
      : Promise.resolve(null),
    isConsolidated ? getConsolidatedOverview(session.tenant.id) : Promise.resolve(null),
  ]);

  const reportLinks = filterLinks(session, [
    { href: "/alertas", label: "Alertas", hint: "Estoque, cancelamentos, retornos" },
    { href: "/relatorios/agendamentos", label: "Agendamentos", hint: "Volume e status" },
    { href: "/relatorios/financeiro", label: "Financeiro", hint: "Receita e mix" },
    { href: "/relatorios/comandas", label: "Comandas", hint: "Ticket e volume" },
    { href: "/relatorios/estoque", label: "Estoque", hint: "Saldo e alertas" },
    { href: "/comissoes", label: "Comissões", hint: "Ranking e analítico" },
    { href: "/relatorios/perfil", label: "Perfil do cliente", hint: "Recompra" },
  ]);

  const atalhos = filterLinks(session, [
    { href: "/agenda", label: "Agenda" },
    { href: "/comandas", label: "Comandas abertas" },
    { href: "/caixa", label: "Caixa" },
    { href: "/conversas", label: "Conversas IA" },
    {
      href: profissionaisHref(session.role, session.staffId),
      label: session.role === "staff" ? "Minha performance" : "Profissionais",
    },
    { href: "/clientes", label: "Clientes" },
  ]);

  const showWaitlist = canAccessRoute("/lista-espera", session.role, {
    staffId: session.staffId,
  });

  const monthDelta =
    dashMonth?.revenueDeltaPct == null
      ? "mês até hoje"
      : `${dashMonth.revenueDeltaPct > 0 ? "+" : ""}${dashMonth.revenueDeltaPct}% vs período anterior`;

  return (
    <>
      {sp.acesso === "negado" ? (
        <div className="form-error banner-inline">
          Você não tem permissão para acessar essa tela.
        </div>
      ) : null}
      {sp.aviso === "vinculo-profissional" ? (
        <div className="form-error banner-inline">
          Sua conta de barbeiro precisa ser vinculada a um profissional em Configurações →
          Equipe.
        </div>
      ) : null}

      {consolidated ? <ConsolidatedOverviewPanel data={consolidated} /> : null}
      {donnaImport ? <DonnaImportBanner status={donnaImport} /> : null}
      {!isConsolidated ? (
        <BranchInaugurationBanner
          tenantSlug={session.tenant.slug}
          branchSlug={session.branch?.slug}
        />
      ) : null}

      <PageHeader
        title={isConsolidated ? "Início — Consolidado" : "Início"}
        subtitle={`${o.tenantName} · ${formatDateLabelSp(today)}`}
        actions={
          canAccessRoute("/agenda", session.role, { staffId: session.staffId }) ? (
            <Link href="/agenda" className="btn btn-primary">
              Abrir agenda
            </Link>
          ) : undefined
        }
      />

      <SummaryCards
        cards={[
          ...(isConsolidated
            ? []
            : [
          ...(canAccessRoute("/agenda", session.role, { staffId: session.staffId })
            ? [
                {
                  label: "Agenda hoje",
                  value: o.appointmentsToday.toLocaleString("pt-BR"),
                  hint: showWaitlist ? `${o.waitlist} na espera` : "do dia",
                },
              ]
            : []),
          ...(canAccessRoute("/comandas", session.role, { staffId: session.staffId })
            ? [
                {
                  label: "Comandas abertas",
                  value: o.openOrdersToday.toLocaleString("pt-BR"),
                  hint: "hoje",
                },
              ]
            : []),
          ...(canFinance && dashMonth
            ? [
                {
                  label: "Receita no mês",
                  value: formatMoney(dashMonth.revenueCents),
                  hint: monthDelta,
                },
                {
                  label: "Ticket médio",
                  value: formatMoney(dashMonth.ticketAvgCents),
                  hint: `${dashMonth.closedOrders} comanda(s)`,
                },
              ]
            : dashMonth
              ? [
                  {
                    label: "Agendamentos no mês",
                    value: dashMonth.appointmentsTotal.toLocaleString("pt-BR"),
                    hint: `No-show ${dashMonth.noShowRatePct}%`,
                  },
                ]
              : []),
            ]),
        ]}
      />

      {alerts ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-toolbar panel-toolbar-split">
            <strong>Alertas da semana</strong>
            <Link href="/alertas" className="btn btn-outline btn-sm">
              Ver todos
            </Link>
          </div>
          <div className="panel-body">
            {alerts.alerts.length === 0 ? (
              <div className="empty-decision">
                Tudo sob controle nesta semana. Sem estoque crítico nem pico de cancelamentos.
              </div>
            ) : (
              <ul className="alert-list">
                {alerts.alerts.slice(0, 5).map((a) => (
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
            )}
          </div>
        </section>
      ) : null}

      {dashWeek ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-toolbar panel-toolbar-split">
            <strong>Esta semana</strong>
            <Link
              href={`/relatorios?period=week&from=${week.from}&to=${weekTo}`}
              className="btn btn-outline btn-sm"
            >
              Detalhe
            </Link>
          </div>
          <div className="panel-body">
            <div className="decision-grid">
              <div className="decision-card">
                <span className="meta-label">Agendamentos</span>
                <strong>{dashWeek.appointmentsTotal.toLocaleString("pt-BR")}</strong>
                <span className="muted-note">
                  Cancel. {dashWeek.cancelRatePct}% · no-show {dashWeek.noShowRatePct}%
                </span>
              </div>
              {canFinance ? (
                <div className="decision-card">
                  <span className="meta-label">Receita da semana</span>
                  <strong>{formatMoney(dashWeek.revenueCents)}</strong>
                  <span className="muted-note">
                    {dashWeek.closedOrders > 0
                      ? `${dashWeek.closedOrders} comanda(s) · ticket ${formatMoney(dashWeek.ticketAvgCents)}`
                      : "Sem pagamentos no período — feche comandas no Caixa"}
                  </span>
                </div>
              ) : null}
              {alerts ? (
                <div className="decision-card">
                  <span className="meta-label">Estoque crítico</span>
                  <strong>
                    {(alerts.summary.lowStockShop + alerts.summary.lowStockBar).toLocaleString(
                      "pt-BR"
                    )}
                  </strong>
                  <span className="muted-note">
                    Loja {alerts.summary.lowStockShop} · Bar {alerts.summary.lowStockBar}
                  </span>
                  <Link href="/relatorios/estoque?low=1" className="btn btn-ghost btn-sm">
                    Abrir estoque baixo
                  </Link>
                </div>
              ) : null}
              {alerts ? (
                <div className="decision-card">
                  <span className="meta-label">Quem voltou</span>
                  <strong>{alerts.summary.returnedLostWeek.toLocaleString("pt-BR")}</strong>
                  <span className="muted-note">
                    + {alerts.summary.renewalsWeek} renovação(ões)
                  </span>
                  <Link href="/relatorios/perfil?tab=retorno" className="btn btn-ghost btn-sm">
                    Ver perfil
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {dashMonth && (canFinance || dashMonth.appointmentStatus.length > 0) ? (
        <div className="dash-grid" style={{ marginTop: 12 }}>
          {canFinance ? (
            <section className="panel dash-panel">
              <div className="panel-toolbar panel-toolbar-split">
                <strong>Receita no mês</strong>
                <Link href="/relatorios/financeiro?period=month" className="btn btn-outline btn-sm">
                  Detalhe
                </Link>
              </div>
              <div className="panel-body">
                {dashMonth.revenueCents <= 0 ? (
                  <div className="empty-decision">
                    Sem pagamentos no mês ainda. Feche comandas no Caixa para alimentar o
                    financeiro.
                  </div>
                ) : (
                  <RevenueAreaChart data={dashMonth.revenueSeries} />
                )}
              </div>
            </section>
          ) : null}
          <section className="panel dash-panel">
            <div className="panel-toolbar panel-toolbar-split">
              <strong>Agenda no mês</strong>
              <Link
                href="/relatorios/agendamentos?period=month"
                className="btn btn-outline btn-sm"
              >
                Detalhe
              </Link>
            </div>
            <div className="panel-body">
              {dashMonth.appointmentsTotal <= 0 ? (
                <div className="empty-decision">Sem agendamentos no mês corrente.</div>
              ) : (
                <StatusBarChart data={dashMonth.appointmentStatus} />
              )}
            </div>
          </section>
          {canFinance ? (
            <section className="panel dash-panel">
              <div className="panel-toolbar">
                <strong>Mix de pagamento</strong>
              </div>
              <div className="panel-body">
                {dashMonth.paymentMix.length === 0 ? (
                  <div className="empty-decision">Sem mix ainda neste mês.</div>
                ) : (
                  <PaymentMixDonut data={dashMonth.paymentMix} />
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {weekly ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-toolbar panel-toolbar-split">
            <strong>Ações de perfil / recompra</strong>
            {canAccessRoute("/relatorios/perfil", session.role, {
              staffId: session.staffId,
            }) ? (
              <Link href="/relatorios/perfil" className="btn btn-outline btn-sm">
                Abrir perfil
              </Link>
            ) : null}
          </div>
          <div className="panel-body">
            <div className="overview-grid" style={{ marginBottom: 12 }}>
              {weekly.cards.map((c) => (
                <Link key={c.id} href={c.href} className="overview-card">
                  <span className="overview-value">{c.value.toLocaleString("pt-BR")}</span>
                  <span className="overview-label">{c.label}</span>
                  <small>{c.hint}</small>
                </Link>
              ))}
            </div>
            <ul className="insight-tips">
              {weekly.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {reportLinks.length > 0 ? (
        <>
          <h2 className="section-title">Relatórios</h2>
          <section className="overview-grid overview-grid-cadastros">
            {reportLinks.map((r) => (
              <Link key={r.href} href={r.href} className="overview-card">
                <span className="overview-label">{r.label}</span>
                {r.hint ? <small>{r.hint}</small> : null}
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {atalhos.length > 0 ? (
        <>
          <h2 className="section-title">Atalhos</h2>
          <section className="quick-links">
            {atalhos.map((l) => (
              <Link key={l.href} href={l.href} className="quick-link">
                {l.label}
              </Link>
            ))}
          </section>
        </>
      ) : null}
    </>
  );
}
