import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { RankingBarChart, StatusBarChart } from "@/components/relatorio/charts";
import { reportStock } from "@/lib/relatorios";
import { formatMoney } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    q?: string;
    low?: string;
  }>;
};

export default async function RelatorioEstoquePage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/estoque", sp);
  const data = await reportStock({
    from: sp.from,
    to: sp.to,
    q: sp.q,
    onlyLow: sp.low === "1",
  });

  return (
    <>
      <PageHeader
        title="Relatório Gerencial — Estoque"
        subtitle="Saldo, alerta de mínimo e vendas de produto no período"
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
          <RelatorioFilters
            action="/relatorios/estoque"
            from={data.from}
            to={data.to}
            q={data.q}
            showSearch
          >
            <label className="filter-field">
              <span>Filtro</span>
              <select name="low" defaultValue={data.onlyLow ? "1" : ""} className="search-input">
                <option value="">Todos ativos</option>
                <option value="1">Só abaixo do mínimo</option>
              </select>
            </label>
          </RelatorioFilters>
        </div>

        <div className="panel-body-flush">
          <SummaryCards
            cards={[
              {
                label: "SKUs ativos",
                value: data.skuCount.toLocaleString("pt-BR"),
              },
              {
                label: "Abaixo do mínimo",
                value: data.lowStockCount.toLocaleString("pt-BR"),
                hint: `${data.zeroStockCount} zerado(s)`,
              },
              {
                label: "Valor em estoque",
                value: formatMoney(data.inventoryValueCents),
                hint: "qtde × preço venda",
              },
            ]}
          />

          <div className="dash-grid" style={{ marginTop: 8 }}>
            <div className="dash-panel-inner">
              <h3 className="section-title section-title-inset">Saldo por categoria</h3>
              <StatusBarChart data={data.byCategory} />
            </div>
            <div className="dash-panel-inner">
              <h3 className="section-title section-title-inset">
                Produtos mais vendidos (R$)
              </h3>
              <RankingBarChart data={data.topSold} />
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Marca</th>
                  <th>Estoque</th>
                  <th>Mínimo</th>
                  <th>Preço</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((p) => (
                    <tr
                      key={p.id}
                      className={p.stockQty <= p.minQty ? "row-warn" : undefined}
                    >
                      <td className="cell-strong">{p.name}</td>
                      <td>{p.category ?? "—"}</td>
                      <td>{p.brand ?? "—"}</td>
                      <td>{p.stockQty.toLocaleString("pt-BR")}</td>
                      <td>{p.minQty.toLocaleString("pt-BR")}</td>
                      <td>{formatMoney(p.priceCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
