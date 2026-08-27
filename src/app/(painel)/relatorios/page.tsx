import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { requirePageAccess } from "@/server/permissions/page-access";
import { canAccessRoute } from "@/server/permissions/routes";
import { requireSession } from "@/server/context/tenant";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/relatorios/agendamentos",
    title: "Agendamentos",
    desc: "Volume, status, cancelamentos e ausências no período.",
  },
  {
    href: "/relatorios/financeiro",
    title: "Gerencial — Financeiro",
    desc: "Pagamentos por forma e comandas fechadas.",
  },
  {
    href: "/relatorios/comandas",
    title: "Gerencial — Comandas",
    desc: "Comandas abertas, fechadas e ticket médio.",
  },
  {
    href: "/relatorios/perfil",
    title: "Gerencial — Perfil",
    desc: "Recompra de serviços e produtos — quem abordar esta semana.",
  },
  {
    href: "/relatorios/estoque",
    title: "Gerencial — Estoque",
    desc: "Estoque mínimo (em evolução).",
    stub: true,
  },
] as const;

export default async function RelatoriosHubPage() {
  await requirePageAccess("/relatorios");
  const session = await requireSession();

  const visible = REPORTS.filter((r) =>
    canAccessRoute(r.href, session.role, { staffId: session.staffId })
  );

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Hub gerencial — tabelas, KPIs e ações da semana"
      />

      <section className="overview-grid overview-grid-cadastros">
        {visible.map((r) => (
          <Link key={r.href} href={r.href} className="overview-card">
            <span className="overview-label">{r.title}</span>
            <small>{r.desc}</small>
            {"stub" in r && r.stub ? <small className="muted">Em construção</small> : null}
          </Link>
        ))}
      </section>
    </>
  );
}
