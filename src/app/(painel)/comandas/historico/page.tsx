import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { OrdersTable } from "@/components/comandas/OrdersTable";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { listOrderHistory, type OrderStatus } from "@/lib/comandas";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function ComandasHistoricoPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status = (sp.status as OrderStatus | "all") || "all";
  const data = await listOrderHistory({
    from: sp.from,
    to: sp.to,
    status,
    q: sp.q,
    page: Number(sp.page) || 1,
  });

  return (
    <>
      <PageHeader
        title="Histórico de comandas"
        subtitle={`${data.total.toLocaleString("pt-BR")} comanda(s) no período`}
      />

      <section className="panel">
        <div className="panel-toolbar">
          <RelatorioFilters
            action="/comandas/historico"
            from={data.from}
            to={data.to}
            q={data.q}
            showSearch
            qPlaceholder="Cliente ou código"
          >
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
              { label: "Valor total", value: formatMoney(data.totalCents) },
            ]}
          />
          <OrdersTable rows={data.rows} />
        </div>
        <div className="panel-footer">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            basePath="/comandas/historico"
            params={{
              from: data.from,
              to: data.to,
              status: data.status !== "all" ? data.status : undefined,
              q: data.q || undefined,
            }}
          />
        </div>
      </section>
    </>
  );
}
