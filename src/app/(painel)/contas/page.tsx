import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { reportContas } from "@/lib/contas";
import { formatDateTimeSp, resolveReportPeriod } from "@/lib/datetime";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
};

export default async function ContasPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/contas", sp);
  const period = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const data = await reportContas({ from: period.from, to: period.to });

  return (
    <>
      <PageHeader
        title="Contas"
        subtitle="A pagar (vales abertos) · a receber (crédito no período) · saídas de caixa"
        actions={
          <>
            <Link href="/caixa" className="btn btn-outline">
              Caixa
            </Link>
            <Link href="/comissoes" className="btn btn-outline">
              Comissões
            </Link>
            <ExportCsvButton
              filename={`contas_${data.from}_${data.to}`}
              headers={["Tipo", "Descrição", "Valor R$", "Quando"]}
              rows={[
                ...data.openAdvances.map((a) => [
                  "a pagar",
                  `${a.staffName ?? "—"} · ${a.kind}${a.notes ? ` · ${a.notes}` : ""}`,
                  (a.amountCents / 100).toFixed(2),
                  formatDateTimeSp(a.occurredAt),
                ]),
                ...data.cashOut.map((m) => [
                  "saída",
                  m.description ?? labelPaymentMethod(m.method ?? "other"),
                  (m.amountCents / 100).toFixed(2),
                  formatDateTimeSp(m.createdAt),
                ]),
              ]}
            />
          </>
        }
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/contas"
            period={period.period}
            from={data.from}
            to={data.to}
          />
          <RelatorioFilters
            action="/contas"
            from={data.from}
            to={data.to}
            hidden={{ period: "custom" }}
          />
        </div>
      </section>

      <SummaryCards
        cards={[
          {
            label: "A pagar (vales/abertos)",
            value: formatMoney(data.payableCents),
            hint: `${data.openAdvances.length} lançamento(s) em aberto`,
          },
          {
            label: "A receber (crédito)",
            value: formatMoney(data.receivableCents),
            hint: `${data.creditCount} pagamento(s) no período`,
          },
          {
            label: "Saídas de caixa",
            value: formatMoney(data.outCents),
            hint: "retiradas / sangrias registradas",
          },
        ]}
      />

      <div className="dash-grid" style={{ marginTop: 12 }}>
        <section className="panel">
          <div className="panel-toolbar">
            <strong>Contas a pagar — vales e adiantamentos abertos</strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Quando</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {data.openAdvances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      Nenhum vale aberto. Lance em Comissões se precisar.
                    </td>
                  </tr>
                ) : (
                  data.openAdvances.map((a) => (
                    <tr key={a.id}>
                      <td className="cell-strong">{a.staffName ?? "—"}</td>
                      <td>{a.kind}</td>
                      <td>{formatMoney(a.amountCents)}</td>
                      <td>{formatDateTimeSp(a.occurredAt)}</td>
                      <td>{a.notes ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-toolbar">
            <strong>Saídas de caixa no período</strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Descrição</th>
                  <th>Método</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.cashOut.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="table-empty">
                      Sem saídas registradas no Caixa neste período.
                    </td>
                  </tr>
                ) : (
                  data.cashOut.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateTimeSp(m.createdAt)}</td>
                      <td>{m.description ?? "—"}</td>
                      <td>{m.method ? labelPaymentMethod(m.method) : "—"}</td>
                      <td>{formatMoney(m.amountCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
