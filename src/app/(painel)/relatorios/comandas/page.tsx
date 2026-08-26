import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { OrdersTable } from "@/components/comandas/OrdersTable";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { reportOrders } from "@/lib/relatorios";
import { formatMoney } from "@/lib/format";
import type { OrderRow } from "@/lib/comandas";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    page?: string;
  }>;
};

export default async function RelatorioComandasPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await reportOrders({
    from: sp.from,
    to: sp.to,
    status: sp.status,
    page: Number(sp.page) || 1,
  });

  return (
    <>
      <PageHeader
        title="Relatório Gerencial — Comandas"
        subtitle={`${data.total.toLocaleString("pt-BR")} comanda(s) · ${data.itemCount.toLocaleString("pt-BR")} item(ns)`}
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
          <RelatorioFilters action="/relatorios/comandas" from={data.from} to={data.to}>
            <label className="filter-field">
              <span>Status</span>
              <select name="status" defaultValue={data.status} className="search-input">
                <option value="all">Todos</option>
                <option value="open">Abertas</option>
                <option value="closed">Fechadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </label>
          </RelatorioFilters>
        </div>

        <div className="panel-body-flush">
          <SummaryCards
            cards={[
              { label: "Comandas", value: data.total.toLocaleString("pt-BR") },
              { label: "Itens consumidos", value: data.itemCount.toLocaleString("pt-BR") },
              { label: "Valor total", value: formatMoney(data.totalCents) },
            ]}
          />

          <OrdersTable rows={data.rows as OrderRow[]} />
        </div>

        <div className="panel-footer">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            basePath="/relatorios/comandas"
            params={{
              from: data.from,
              to: data.to,
              status: data.status !== "all" ? data.status : undefined,
            }}
          />
        </div>
      </section>
    </>
  );
}
