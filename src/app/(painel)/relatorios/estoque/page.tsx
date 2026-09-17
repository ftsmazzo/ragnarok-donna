import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { RankingBarChart, StatusBarChart } from "@/components/relatorio/charts";
import { reportStock } from "@/lib/relatorios";
import { resolveReportPeriod } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import type { StockScope } from "@/lib/product-category";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    period?: string;
    q?: string;
    low?: string;
    scope?: string;
  }>;
};

function parseScope(raw?: string): StockScope {
  if (raw === "shop" || raw === "bar" || raw === "insumos") return raw;
  return "all";
}

export default async function RelatorioEstoquePage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/estoque", sp);
  const period = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const scope = parseScope(sp.scope);
  const data = await reportStock({
    from: period.from,
    to: period.to,
    q: sp.q,
    onlyLow: sp.low === "1",
    scope,
  });

  const scopeQ = `period=${period.period}&from=${data.from}&to=${data.to}${data.onlyLow ? "&low=1" : ""}${data.q ? `&q=${encodeURIComponent(data.q)}` : ""}`;
  const isPurchaseList = data.onlyLow;
  const colSpan = isPurchaseList ? 8 : 6;

  return (
    <>
      <PageHeader
        title={isPurchaseList ? "Lista de compra" : "Estoque"}
        subtitle={
          isPurchaseList
            ? "Itens abaixo do mínimo — qty a pedir e custo estimado"
            : "Saldo, mínimo e vendas — barbearia, bar e insumos"
        }
        actions={
          <ExportCsvButton
            filename={`${isPurchaseList ? "lista_compra" : "estoque"}_${scope}_${data.from}`}
            headers={
              isPurchaseList
                ? ["Produto", "Categoria", "Marca", "Estoque", "Mínimo", "A pedir", "Custo est. R$", "Preço"]
                : ["Produto", "Categoria", "Marca", "Estoque", "Mínimo", "Preço"]
            }
            rows={data.rows.map((p) =>
              isPurchaseList
                ? [
                    p.name,
                    p.category,
                    p.brand,
                    p.stockQty,
                    p.minQty,
                    p.orderQty,
                    p.orderCostCents != null ? (p.orderCostCents / 100).toFixed(2) : "",
                    (p.priceCents / 100).toFixed(2),
                  ]
                : [
                    p.name,
                    p.category,
                    p.brand,
                    p.stockQty,
                    p.minQty,
                    (p.priceCents / 100).toFixed(2),
                  ]
            )}
          />
        }
      />

      <section className="panel">
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <div className="period-presets" role="tablist" aria-label="Escopo">
            <Link
              href={`/relatorios/estoque?${scopeQ}&scope=all`}
              className={`btn btn-outline btn-sm${scope === "all" ? " is-active" : ""}`}
            >
              Tudo
            </Link>
            <Link
              href={`/relatorios/estoque?${scopeQ}&scope=shop`}
              className={`btn btn-outline btn-sm${scope === "shop" ? " is-active" : ""}`}
            >
              Barbearia
            </Link>
            <Link
              href={`/relatorios/estoque?${scopeQ}&scope=bar`}
              className={`btn btn-outline btn-sm${scope === "bar" ? " is-active" : ""}`}
            >
              Bar
            </Link>
            <Link
              href={`/relatorios/estoque?${scopeQ}&scope=insumos`}
              className={`btn btn-outline btn-sm${scope === "insumos" ? " is-active" : ""}`}
            >
              Insumos
            </Link>
          </div>
          <PeriodPresets
            basePath="/relatorios/estoque"
            period={period.period}
            from={data.from}
            to={data.to}
            extraParams={{
              scope: scope !== "all" ? scope : undefined,
              low: data.onlyLow ? "1" : undefined,
              q: data.q || undefined,
            }}
          />
          <RelatorioFilters
            action="/relatorios/estoque"
            from={data.from}
            to={data.to}
            q={data.q}
            showSearch
            qPlaceholder="Produto, categoria ou marca"
            hidden={{ period: "custom", scope: scope !== "all" ? scope : undefined }}
          >
            <label className="filter-field">
              <span>Filtro</span>
              <select name="low" defaultValue={data.onlyLow ? "1" : ""} className="search-input">
                <option value="">Todos ativos</option>
                <option value="1">Lista de compra (abaixo do mínimo)</option>
              </select>
            </label>
          </RelatorioFilters>
        </div>

        <div className="panel-body-flush">
          <SummaryCards
            cards={[
              {
                label: "SKUs",
                value: data.skuCount.toLocaleString("pt-BR"),
                hint:
                  scope === "bar"
                    ? "itens do bar"
                    : scope === "shop"
                      ? "loja"
                      : scope === "insumos"
                        ? "insumos"
                        : "ativos",
              },
              {
                label: "Abaixo do mínimo",
                value: data.lowStockCount.toLocaleString("pt-BR"),
                hint: `${data.zeroStockCount} zerado(s) — repor agora`,
              },
              {
                label: "Valor parado",
                value: formatMoney(data.inventoryValueCents),
                hint: "qtde × preço de venda",
              },
              ...(isPurchaseList
                ? [
                    {
                      label: "A pedir (un.)",
                      value: data.orderQtyTotal.toLocaleString("pt-BR"),
                      hint:
                        data.orderCostTotalCents != null
                          ? `custo est. ${formatMoney(data.orderCostTotalCents)}`
                          : "preencha custo no cadastro p/ estimar R$",
                    },
                  ]
                : []),
            ]}
          />

          {!isPurchaseList ? (
            <div className="dash-grid" style={{ marginTop: 8 }}>
              <div className="dash-panel-inner">
                <h3 className="section-title section-title-inset">Saldo por categoria</h3>
                <StatusBarChart data={data.byCategory} />
              </div>
              <div className="dash-panel-inner">
                <h3 className="section-title section-title-inset">
                  Top vendidos no período (R$)
                </h3>
                {data.topSold.length === 0 ? (
                  <p className="empty-decision">Sem vendas de produto no período.</p>
                ) : (
                  <RankingBarChart data={data.topSold} />
                )}
              </div>
            </div>
          ) : null}

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Marca</th>
                  <th>Estoque</th>
                  <th>Mínimo</th>
                  {isPurchaseList ? <th>A pedir</th> : null}
                  {isPurchaseList ? <th>Custo est.</th> : null}
                  <th>Preço</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="table-empty">
                      Nenhum produto neste filtro. Cadastre em Produtos ou troque a aba
                      Barbearia/Bar/Insumos.
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
                      {isPurchaseList ? (
                        <td className="cell-strong">{p.orderQty.toLocaleString("pt-BR")}</td>
                      ) : null}
                      {isPurchaseList ? (
                        <td>
                          {p.orderCostCents != null ? formatMoney(p.orderCostCents) : "—"}
                        </td>
                      ) : null}
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
