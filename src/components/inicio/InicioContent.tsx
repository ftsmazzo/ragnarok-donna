import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import {
  PaymentMixDonut,
  RevenueAreaChart,
  StatusBarChart,
} from "@/components/relatorio/charts";
import { getTenantOverview } from "@/lib/cadastros";
import { formatDateLabelSp, monthStartSp, todaySp } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import { canAccessRoute } from "@/server/permissions/routes";
import { isManagementRole } from "@/server/permissions/roles";
import { getManagementDashboard, getWeeklyInsights } from "@/server/insights";
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

  const today = todaySp();
  const monthFrom = monthStartSp();

  const [o, weekly, dash] = await Promise.all([
    getTenantOverview(),
    showInsights ? getWeeklyInsights() : Promise.resolve(null),
    canReports
      ? getManagementDashboard({ from: monthFrom, to: today })
      : Promise.resolve(null),
  ]);

  const reportLinks = filterLinks(session, [
    {
      href: "/relatorios/agendamentos",
      label: "Agendamentos",
      hint: "Volume e status",
    },
    {
      href: "/relatorios/financeiro",
      label: "Financeiro",
      hint: "Receita e mix",
    },
    {
      href: "/relatorios/comandas",
      label: "Comandas",
      hint: "Ticket e volume",
    },
    {
      href: "/relatorios/estoque",
      label: "Estoque",
      hint: "Saldo e alertas",
    },
    { href: "/comissoes", label: "Comissões", hint: "Ranking e analítico" },
    { href: "/relatorios/perfil", label: "Perfil", hint: "Recompra" },
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

  const delta =
    dash?.revenueDeltaPct == null
      ? "mês até hoje"
      : `${dash.revenueDeltaPct > 0 ? "+" : ""}${dash.revenueDeltaPct}% vs período anterior`;

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

      <PageHeader
        title="Início"
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
          ...(canFinance && dash
            ? [
                {
                  label: "Receita no mês",
                  value: formatMoney(dash.revenueCents),
                  hint: delta,
                },
                {
                  label: "Ticket médio",
                  value: formatMoney(dash.ticketAvgCents),
                  hint: `${dash.closedOrders} comanda(s)`,
                },
              ]
            : dash
              ? [
                  {
                    label: "Agendamentos no mês",
                    value: dash.appointmentsTotal.toLocaleString("pt-BR"),
                    hint: `No-show ${dash.noShowRatePct}%`,
                  },
                ]
              : []),
        ]}
      />

      {dash && (canFinance || dash.appointmentStatus.length > 0) ? (
        <div className="dash-grid" style={{ marginTop: 12 }}>
          {canFinance ? (
            <section className="panel dash-panel">
              <div className="panel-toolbar panel-toolbar-split">
                <strong>Receita no mês</strong>
                <Link href="/relatorios/financeiro" className="btn btn-outline btn-sm">
                  Detalhe
                </Link>
              </div>
              <div className="panel-body">
                <RevenueAreaChart data={dash.revenueSeries} />
              </div>
            </section>
          ) : null}
          <section className="panel dash-panel">
            <div className="panel-toolbar panel-toolbar-split">
              <strong>Agenda no mês</strong>
              <Link href="/relatorios/agendamentos" className="btn btn-outline btn-sm">
                Detalhe
              </Link>
            </div>
            <div className="panel-body">
              <StatusBarChart data={dash.appointmentStatus} />
            </div>
          </section>
          {canFinance ? (
            <section className="panel dash-panel">
              <div className="panel-toolbar">
                <strong>Mix de pagamento</strong>
              </div>
              <div className="panel-body">
                <PaymentMixDonut data={dash.paymentMix} />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {weekly ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-toolbar panel-toolbar-split">
            <strong>O que fazer esta semana</strong>
            {canAccessRoute("/relatorios/perfil", session.role, {
              staffId: session.staffId,
            }) ? (
              <Link href="/relatorios/perfil" className="btn btn-outline btn-sm">
                Perfil / recompra
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
          <h2 className="section-title">Relatórios do dia a dia</h2>
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
