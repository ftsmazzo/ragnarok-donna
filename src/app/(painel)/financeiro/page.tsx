import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { TreasuryAdminPanel } from "@/components/financeiro/TreasuryAdminPanel";
import { formatMoney } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";
import { requireTenantContext } from "@/server/context/tenant";
import {
  getTreasuryDashboard,
  getTreasuryPermissions,
  getTreasuryBridgeSettings,
  listChartAccounts,
} from "@/server/treasury";

export const dynamic = "force-dynamic";

export default async function FinanceiroHomePage() {
  await requirePageAccess("/financeiro");
  const tenant = await requireTenantContext();
  const [dash, permissions, bridge, charts] = await Promise.all([
    getTreasuryDashboard(),
    getTreasuryPermissions(),
    getTreasuryBridgeSettings(),
    listChartAccounts(),
  ]);

  const showDonnaSeed =
    /donna/i.test(tenant.slug) || /donna/i.test(tenant.name);

  const links = [
    { href: "/financeiro/a-pagar", label: "Contas a pagar", hint: "Despesas e baixas" },
    { href: "/financeiro/a-receber", label: "Contas a receber", hint: "Receitas previstas" },
    { href: "/financeiro/bancos", label: "Bancos / extrato", hint: "Conciliação" },
    { href: "/financeiro/cartoes", label: "Cartões", hint: "Limite e fatura" },
    { href: "/financeiro/plano", label: "Plano de contas", hint: `${charts.length} contas` },
    { href: "/financeiro/relatorios", label: "FCM · FCD · DRE", hint: "Relatórios" },
    { href: "/financeiro/calculadoras", label: "Calculadoras", hint: "CG e PE" },
  ] as const;

  return (
    <>
      <PageHeader
        title="Tesouraria"
        subtitle={`${tenant.name} · separado do caixa de turno`}
        actions={
          <>
            <Link href="/financeiro/a-pagar" className="btn btn-outline">
              A pagar
            </Link>
            <Link href="/financeiro/a-receber" className="btn btn-outline">
              A receber
            </Link>
            <Link href="/caixa" className="btn btn-ghost">
              Caixa (turno)
            </Link>
          </>
        }
      />

      <SummaryCards
        cards={[
          { label: "A pagar (aberto)", value: formatMoney(dash.payablesOpenCents) },
          { label: "A receber (aberto)", value: formatMoney(dash.receivablesOpenCents) },
          {
            label: `Atrasados (${dash.overdueCount})`,
            value: formatMoney(dash.overduePayablesCents),
          },
          { label: "Na semana", value: formatMoney(dash.thisWeekPayablesCents) },
        ]}
      />

      <nav className="treasury-nav" aria-label="Módulos da tesouraria">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="treasury-nav-card">
            <strong>{item.label}</strong>
            <span className="muted">{item.hint}</span>
          </Link>
        ))}
      </nav>

      <TreasuryAdminPanel
        bridge={bridge}
        canWrite={permissions.canWrite}
        showDonnaSeed={showDonnaSeed}
      />
    </>
  );
}
