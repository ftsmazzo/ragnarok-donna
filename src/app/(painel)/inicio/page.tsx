import { PageHeader } from "@/components/shell/PageHeader";
import { getTenantOverview } from "@/lib/cadastros";
import { formatDateLabelSp, todaySp } from "@/lib/datetime";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CADASTROS = [
  { href: "/clientes", label: "Clientes", key: "clientsActive" as const, hint: "ativos" },
  { href: "/profissionais", label: "Profissionais", key: "staff" as const },
  { href: "/servicos", label: "Serviços", key: "services" as const },
  { href: "/produtos", label: "Produtos", key: "products" as const },
  { href: "/pacotes", label: "Pacotes", key: "packages" as const },
];

export default async function InicioPage() {
  const o = await getTenantOverview();
  const today = todaySp();

  return (
    <>
      <PageHeader
        title="Início"
        subtitle={`${o.tenantName} · ${formatDateLabelSp(today)}`}
        actions={
          <Link href="/agenda" className="btn btn-primary">
            Abrir agenda
          </Link>
        }
      />

      <section className="overview-grid">
        <Link href={`/agenda?date=${today}`} className="overview-card is-highlight">
          <span className="overview-value">{o.appointmentsToday}</span>
          <span className="overview-label">Agendamentos hoje</span>
        </Link>
        <Link href="/lista-espera" className="overview-card">
          <span className="overview-value">{o.waitlist}</span>
          <span className="overview-label">Lista de espera</span>
        </Link>
        <Link href="/comandas" className="overview-card">
          <span className="overview-value">{o.openOrdersToday}</span>
          <span className="overview-label">Comandas abertas hoje</span>
        </Link>
        <div className="overview-card is-static">
          <span className="overview-value">{o.clients.toLocaleString("pt-BR")}</span>
          <span className="overview-label">Clientes no banco</span>
          <small>{o.clientsActive.toLocaleString("pt-BR")} ativos</small>
        </div>
      </section>

      <h2 className="section-title">Cadastros</h2>
      <section className="overview-grid overview-grid-cadastros">
        {CADASTROS.map((c) => (
          <Link key={c.href} href={c.href} className="overview-card">
            <span className="overview-value">{o[c.key].toLocaleString("pt-BR")}</span>
            <span className="overview-label">{c.label}</span>
            {c.hint ? <small>{c.hint}</small> : null}
          </Link>
        ))}
      </section>

      <h2 className="section-title">Operação</h2>
      <section className="quick-links">
        <Link href="/agenda" className="quick-link">
          Agenda
        </Link>
        <Link href="/comandas" className="quick-link">
          Comandas abertas
        </Link>
        <Link href="/comandas/historico" className="quick-link">
          Histórico de comandas
        </Link>
        <Link href="/relatorios/agendamentos" className="quick-link">
          Relatório de agendamentos
        </Link>
        <Link href="/relatorios/financeiro" className="quick-link">
          Relatório financeiro
        </Link>
        <Link href="/conversas" className="quick-link">
          Conversas IA
        </Link>
      </section>
    </>
  );
}
