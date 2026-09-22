import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { TreasuryAdminPanel } from "@/components/financeiro/TreasuryAdminPanel";
import { formatMoney } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";
import {
  getTreasuryDashboard,
  getTreasuryPermissions,
  getTreasuryBridgeSettings,
  listChartAccounts,
} from "@/server/treasury";

export const dynamic = "force-dynamic";

export default async function FinanceiroHomePage() {
  await requirePageAccess("/financeiro");
  const [dash, permissions, bridge, charts] = await Promise.all([
    getTreasuryDashboard(),
    getTreasuryPermissions(),
    getTreasuryBridgeSettings(),
    listChartAccounts(),
  ]);

  return (
    <>
      <PageHeader
        title="Tesouraria"
        subtitle="Plano de contas, títulos AP/AR e relatórios — separado do caixa de turno"
        actions={
          <>
            <Link href="/financeiro/a-pagar" className="btn btn-outline">
              A pagar
            </Link>
            <Link href="/financeiro/a-receber" className="btn btn-outline">
              A receber
            </Link>
            <Link href="/financeiro/plano" className="btn btn-outline">
              Plano de contas
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

      <nav
        className="panel"
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8,
          padding: 12,
        }}
      >
        {[
          ["/financeiro/a-pagar", "Contas a pagar"],
          ["/financeiro/a-receber", "Contas a receber"],
          ["/financeiro/bancos", "Bancos / extrato"],
          ["/financeiro/cartoes", "Cartões"],
          ["/financeiro/plano", `Plano (${charts.length})`],
          ["/financeiro/relatorios", "FCM · FCD · DRE"],
          ["/financeiro/calculadoras", "Calculadoras"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="btn btn-outline" style={{ justifyContent: "center" }}>
            {label}
          </Link>
        ))}
      </nav>

      <TreasuryAdminPanel bridge={bridge} canWrite={permissions.canWrite} />
    </>
  );
}
