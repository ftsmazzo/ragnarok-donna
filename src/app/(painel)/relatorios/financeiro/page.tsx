import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { PaymentMixDonut, RevenueAreaChart, RankingBarChart } from "@/components/relatorio/charts";
import { reportFinancial } from "@/lib/relatorios";
import { resolveReportPeriod } from "@/lib/datetime";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import { getManagementDashboard } from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
};

export default async function RelatorioFinanceiroPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/financeiro", sp);
  const period = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const [data, dash] = await Promise.all([
    reportFinancial({ from: period.from, to: period.to }),
    getManagementDashboard({ from: period.from, to: period.to }),
  ]);

  const emptyPayments = data.totalPaymentsCount === 0;

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle={`Receitas de ${data.from} a ${data.to}`}
        actions={
          <ExportCsvButton
            filename={`financeiro_${data.from}_${data.to}`}
            headers={["Forma", "Qtd", "Total R$", "%"]}
            rows={data.byMethod.map((m) => {
              const pct =
                data.totalPaymentsCents > 0
                  ? ((m.totalCents / data.totalPaymentsCents) * 100).toFixed(1)
                  : "0";
              return [
                labelPaymentMethod(m.method),
                m.count,
                (m.totalCents / 100).toFixed(2),
                pct,
              ];
            })}
          />
        }
      />

      <section className="panel">
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/relatorios/financeiro"
            period={period.period}
            from={data.from}
            to={data.to}
          />
          <RelatorioFilters
            action="/relatorios/financeiro"
            from={data.from}
            to={data.to}
            hidden={{ period: "custom" }}
          />
        </div>

        <div className="panel-body-flush">
          {emptyPayments ? (
            <p className="empty-decision" style={{ margin: 12 }}>
              Sem pagamentos no período — feche comandas no Caixa para ver receita aqui.
            </p>
          ) : null}

          <SummaryCards
            cards={[
              {
                label: "Receita (pagamentos)",
                value: formatMoney(data.totalPaymentsCents),
                hint: `${data.totalPaymentsCount} pagamento(s) · o que entrou de fato`,
              },
              {
                label: "Ticket médio",
                value: formatMoney(data.ticketAvgCents),
                hint: "por comanda fechada",
              },
              {
                label: "Serviços vs produtos",
                value: `${formatMoney(data.servicesCents)} / ${formatMoney(data.productsCents)}`,
                hint: "mix de itens nas comandas",
              },
              {
                label: "Comandas abertas",
                value: data.openOrdersCount.toLocaleString("pt-BR"),
                hint: "ainda no balcão",
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

          <div className="dash-panel-inner" style={{ margin: "12px 12px 0" }}>
            <h3 className="section-title section-title-inset">Receita por profissional</h3>
            {data.byStaff.length === 0 ? (
              <p className="empty-decision">Sem itens com profissional no período.</p>
            ) : (
              <RankingBarChart
                data={data.byStaff.map((s) => ({
                  name: s.staffName.length > 22 ? `${s.staffName.slice(0, 20)}…` : s.staffName,
                  value: s.totalCents / 100,
                  extra: s.count,
                }))}
              />
            )}
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
