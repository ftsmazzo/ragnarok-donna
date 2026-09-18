import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { RankingBarChart } from "@/components/relatorio/charts";
import { ExtrasGoalsForm } from "@/components/relatorio/ExtrasGoalsForm";
import { reportExtrasRanking } from "@/server/insights/extras-ranking";
import { resolveReportPeriod } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
};

export default async function RelatorioExtrasPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/extras", sp);
  const period = resolveReportPeriod({
    period: sp.period ?? "month",
    from: sp.from,
    to: sp.to,
  });
  const data = await reportExtrasRanking({
    from: period.from,
    to: period.to,
    period: period.period,
  });

  const chartExtras = data.rows
    .filter((r) => r.cents > 0)
    .slice(0, 10)
    .map((r) => ({
      name: r.staffName.length > 16 ? `${r.staffName.slice(0, 14)}…` : r.staffName,
      value: r.cents / 100,
      extra: r.qty,
    }));

  const chartAttend = [...data.rows]
    .filter((r) => r.clientsServed > 0)
    .sort((a, b) => b.clientsServed - a.clientsServed)
    .slice(0, 10)
    .map((r) => ({
      name: r.staffName.length > 16 ? `${r.staffName.slice(0, 14)}…` : r.staffName,
      value: r.clientsServed,
      extra: r.serviceItems,
    }));

  return (
    <>
      <PageHeader
        title="Ranking da equipe"
        subtitle="Extras (R$), produtos (un.) e atendimentos no mesmo período"
        actions={
          <ExportCsvButton
            filename={`ranking_equipe_${data.from}_${data.to}`}
            headers={[
              "#",
              "Profissional",
              "Produtos un.",
              "Extras R$",
              "Atendimentos",
              "Itens serviço",
              "Meta R$",
              "% meta",
            ]}
            rows={data.rows.map((r, i) => [
              i + 1,
              r.staffName,
              r.qty,
              (r.cents / 100).toFixed(2),
              r.clientsServed,
              r.serviceItems,
              (r.goalCents / 100).toFixed(2),
              r.progressPct == null ? "" : r.progressPct.toFixed(1),
            ])}
          />
        }
      />

      <section className="panel">
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/relatorios/extras"
            period={data.period}
            from={data.from}
            to={data.to}
          />
          <RelatorioFilters
            action="/relatorios/extras"
            from={data.from}
            to={data.to}
            hidden={{ period: data.period }}
          />
        </div>
      </section>

      <SummaryCards
        cards={[
          { label: "Extras no período", value: formatMoney(data.totalCents) },
          { label: "Produtos (un.)", value: String(data.totalQty) },
          {
            label: "Atendimentos",
            value: data.totalClientsServed.toLocaleString("pt-BR"),
            hint: `${data.totalServiceItems.toLocaleString("pt-BR")} itens de serviço`,
          },
          {
            label: "Com meta",
            value: String(data.rows.filter((r) => r.goalCents > 0).length),
          },
        ]}
      />

      {data.canWriteGoals ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2 className="panel-title">Cadastrar meta mensal (extras)</h2>
          <p className="muted-note" style={{ marginBottom: 12 }}>
            Meta de venda de produtos por barbeiro. O progresso usa o período filtrado vs a
            meta do mês.
          </p>
          <ExtrasGoalsForm
            rows={data.rows.map((r) => ({
              staffId: r.staffId,
              staffName: r.staffName,
              goalCents: r.goalCents,
              goalQty: r.goalQty,
            }))}
          />
        </section>
      ) : null}

      <div className="dash-grid" style={{ marginTop: 12 }}>
        {chartExtras.length ? (
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Ranking extras (R$)</strong>
            </div>
            <div className="panel-body">
              <RankingBarChart data={chartExtras} valueLabel="R$" />
            </div>
          </section>
        ) : null}
        {chartAttend.length ? (
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Ranking atendimentos (clientes)</strong>
            </div>
            <div className="panel-body">
              <RankingBarChart data={chartAttend} valueLabel="cli." />
            </div>
          </section>
        ) : null}
      </div>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Profissional</th>
                <th>Produtos</th>
                <th>Extras</th>
                <th>Atendimentos</th>
                <th>Itens svc</th>
                <th>Meta mês</th>
                <th>Progresso</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="panel-empty">
                    Nenhum profissional ativo.
                  </td>
                </tr>
              ) : (
                data.rows.map((r, i) => (
                  <tr key={r.staffId}>
                    <td>{i + 1}</td>
                    <td>{r.staffName}</td>
                    <td>{r.qty}</td>
                    <td>{formatMoney(r.cents)}</td>
                    <td>{r.clientsServed.toLocaleString("pt-BR")}</td>
                    <td>{r.serviceItems.toLocaleString("pt-BR")}</td>
                    <td>{r.goalCents > 0 ? formatMoney(r.goalCents) : "—"}</td>
                    <td>
                      {r.progressPct == null ? (
                        "—"
                      ) : (
                        <span className="extras-progress">
                          <span
                            className="extras-progress-bar"
                            style={{
                              width: `${Math.min(100, r.progressPct)}%`,
                            }}
                          />
                          <span className="extras-progress-label">
                            {r.progressPct.toFixed(0)}%
                            {r.goalQty != null ? ` · meta ${r.goalQty} un` : ""}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
