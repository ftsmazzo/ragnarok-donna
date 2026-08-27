import { PageHeader } from "@/components/shell/PageHeader";
import { getTenantOverview } from "@/lib/cadastros";
import { formatDateLabelSp, todaySp } from "@/lib/datetime";
import { canAccessRoute } from "@/server/permissions/routes";
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
  const o = await getTenantOverview();
  const today = todaySp();

  const cadastros = filterLinks(session, [
    { href: "/clientes", label: "Clientes", hint: `${o.clientsActive.toLocaleString("pt-BR")} ativos` },
    { href: profissionaisHref(session.role, session.staffId), label: session.role === "staff" ? "Minha performance" : "Profissionais" },
    { href: "/servicos", label: "Serviços" },
    { href: "/produtos", label: "Produtos" },
    { href: "/pacotes", label: "Pacotes" },
  ]);

  const operacao = filterLinks(session, [
    { href: "/agenda", label: "Agenda" },
    { href: "/comandas", label: "Comandas abertas" },
    { href: "/comandas/historico", label: "Histórico de comandas" },
    { href: "/relatorios/agendamentos", label: "Relatório de agendamentos" },
    { href: "/relatorios/financeiro", label: "Relatório financeiro" },
    { href: "/conversas", label: "Conversas IA" },
    { href: "/comissoes", label: "Comissões" },
    { href: "/caixa", label: "Caixa" },
  ]);

  const showWaitlist = canAccessRoute("/lista-espera", session.role, {
    staffId: session.staffId,
  });

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

      <section className="overview-grid">
        {canAccessRoute("/agenda", session.role, { staffId: session.staffId }) ? (
          <Link href={`/agenda?date=${today}`} className="overview-card is-highlight">
            <span className="overview-value">{o.appointmentsToday}</span>
            <span className="overview-label">Agendamentos hoje</span>
          </Link>
        ) : null}
        {showWaitlist ? (
          <Link href="/lista-espera" className="overview-card">
            <span className="overview-value">{o.waitlist}</span>
            <span className="overview-label">Lista de espera</span>
          </Link>
        ) : null}
        {canAccessRoute("/comandas", session.role, { staffId: session.staffId }) ? (
          <Link href="/comandas" className="overview-card">
            <span className="overview-value">{o.openOrdersToday}</span>
            <span className="overview-label">Comandas abertas hoje</span>
          </Link>
        ) : null}
        {canAccessRoute("/clientes", session.role, { staffId: session.staffId }) ? (
          <div className="overview-card is-static">
            <span className="overview-value">{o.clients.toLocaleString("pt-BR")}</span>
            <span className="overview-label">Clientes no banco</span>
            <small>{o.clientsActive.toLocaleString("pt-BR")} ativos</small>
          </div>
        ) : null}
      </section>

      {cadastros.length > 0 ? (
        <>
          <h2 className="section-title">Cadastros</h2>
          <section className="overview-grid overview-grid-cadastros">
            {cadastros.map((c) => (
              <Link key={c.href} href={c.href} className="overview-card">
                <span className="overview-value">
                  {c.href === "/clientes"
                    ? o.clientsActive.toLocaleString("pt-BR")
                    : c.href.startsWith("/profissionais")
                      ? o.staff.toLocaleString("pt-BR")
                      : c.href === "/servicos"
                        ? o.services.toLocaleString("pt-BR")
                        : c.href === "/produtos"
                          ? o.products.toLocaleString("pt-BR")
                          : o.packages.toLocaleString("pt-BR")}
                </span>
                <span className="overview-label">{c.label}</span>
                {c.hint ? <small>{c.hint}</small> : null}
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {operacao.length > 0 ? (
        <>
          <h2 className="section-title">Operação</h2>
          <section className="quick-links">
            {operacao.map((l) => (
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
