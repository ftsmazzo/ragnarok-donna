import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { OrdersTable } from "@/components/comandas/OrdersTable";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { StatusBarChart } from "@/components/relatorio/charts";
import { reportOrders } from "@/lib/relatorios";
import { formatMoney, labelOrderStatus } from "@/lib/format";
import type { OrderRow } from "@/lib/comandas";
import { requirePageAccess } from "@/server/permissions/page-access";

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
  await requirePageAccess("/relatorios/comandas", sp);
  const data = await reportOrders({
    from: sp.from,
    to: sp.to,
    status: sp.status,
    page: Number(sp.page) || 1,
  });

  const statusChart = Object.entries(data.byStatus).map(([status, info]) => ({
    name: labelOrderStatus(status),
    value: info.n,
  }));

  const ticketAvg =
    data.total > 0 ? Math.round(data.totalCents / data.total) : 0;

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
              { label: "Ticket médio", value: formatMoney(ticketAvg) },
            ]}
          />

          <div className="dash-panel-inner" style={{ margin: "8px 12px 16px" }}>
            <h3 className="section-title section-title-inset">Distribuição por status</h3>
            <StatusBarChart data={statusChart} />
          </div>

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
