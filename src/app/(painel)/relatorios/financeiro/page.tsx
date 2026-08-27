import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { PaymentMixDonut, RevenueAreaChart } from "@/components/relatorio/charts";
import { reportFinancial } from "@/lib/relatorios";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import { getManagementDashboard } from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function RelatorioFinanceiroPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/financeiro", sp);
  const [data, dash] = await Promise.all([
    reportFinancial({ from: sp.from, to: sp.to }),
    getManagementDashboard({ from: sp.from, to: sp.to }),
  ]);

  return (
    <>
      <PageHeader
        title="Relatório Gerencial — Financeiro"
        subtitle={`Receitas de ${data.from} a ${data.to}`}
        actions={
          <>
            <button type="button" className="btn btn-outline" disabled title="Em breve">
              Excel
            </button>
            <button type="button" className="btn btn-outline" disabled title="Em breve">
              PDF
            </button>
          </>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <RelatorioFilters action="/relatorios/financeiro" from={data.from} to={data.to} />
        </div>

        <div className="panel-body-flush">
          <SummaryCards
            cards={[
              {
                label: "Receita (pagamentos)",
                value: formatMoney(data.totalPaymentsCents),
                hint: `${data.totalPaymentsCount} pagamento(s)`,
              },
              {
                label: "Comandas fechadas",
                value: data.closedOrdersCount.toLocaleString("pt-BR"),
                hint: formatMoney(data.closedOrdersCents),
              },
              {
                label: "Comandas abertas",
                value: data.openOrdersCount.toLocaleString("pt-BR"),
                hint: "agora",
              },
            ]}
          />

          <div className="dash-grid" style={{ marginTop: 8 }}>
            <div className="dash-panel-inner">
              <h3 className="section-title section-title-inset">Receita no tempo</h3>
              <RevenueAreaChart data={dash.revenueSeries} />
            </div>
            <div className="dash-panel-inner">
              <h3 className="section-title section-title-inset">Mix de pagamento</h3>
              <PaymentMixDonut data={dash.paymentMix} />
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Forma de pagamento</th>
                  <th>Qtd</th>
                  <th>Total</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {data.byMethod.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="table-empty">
                      Nenhum pagamento no período.
                    </td>
                  </tr>
                ) : (
                  data.byMethod.map((m) => {
                    const pct =
                      data.totalPaymentsCents > 0
                        ? ((m.totalCents / data.totalPaymentsCents) * 100).toFixed(1)
                        : "0";
                    return (
                      <tr key={m.method}>
                        <td className="cell-strong">{labelPaymentMethod(m.method)}</td>
                        <td>{m.count.toLocaleString("pt-BR")}</td>
                        <td>{formatMoney(m.totalCents)}</td>
                        <td>{pct}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
