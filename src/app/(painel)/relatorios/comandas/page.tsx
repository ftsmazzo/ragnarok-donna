import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { OrdersTable } from "@/components/comandas/OrdersTable";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { StatusBarChart } from "@/components/relatorio/charts";
import { reportOrders } from "@/lib/relatorios";
import { resolveReportPeriod, formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelOrderStatus } from "@/lib/format";
import type { OrderRow } from "@/lib/comandas";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    period?: string;
    status?: string;
    page?: string;
  }>;
};

export default async function RelatorioComandasPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/comandas", sp);
  const period = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const data = await reportOrders({
    from: period.from,
    to: period.to,
    status: sp.status,
    page: Number(sp.page) || 1,
  });

  const statusChart = Object.entries(data.byStatus).map(([status, info]) => ({
    name: labelOrderStatus(status),
    value: info.n,
  }));

  const ticketAvg = data.total > 0 ? Math.round(data.totalCents / data.total) : 0;

  return (
    <>
      <PageHeader
        title="Comandas"
        subtitle={`${data.total.toLocaleString("pt-BR")} comanda(s) · ticket e tempo médio`}
        actions={
          <ExportCsvButton
            filename={`comandas_${data.from}_${data.to}`}
            headers={["Aberta", "Fechada", "Cliente", "Itens", "Total", "Status", "Profissional"]}
            rows={data.rows.map((r) => [
              formatDateTimeSp(r.openedAt),
              r.closedAt ? formatDateTimeSp(r.closedAt) : "",
              r.clientName,
              r.itemCount,
              (r.totalCents / 100).toFixed(2),
              labelOrderStatus(r.status),
              r.profissional,
            ])}
          />
        }
      />

      <section className="panel">
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/relatorios/comandas"
            period={period.period}
            from={data.from}
            to={data.to}
            extraParams={{
              status: data.status !== "all" ? data.status : undefined,
            }}
          />
          <RelatorioFilters
            action="/relatorios/comandas"
            from={data.from}
            to={data.to}
            hidden={{ period: "custom" }}
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
          {data.total === 0 ? (
            <p className="empty-decision" style={{ margin: 12 }}>
              Sem comandas no período — abra no balcão ou importe o histórico.
            </p>
          ) : null}

          <SummaryCards
            cards={[
              {
                label: "Comandas",
                value: data.total.toLocaleString("pt-BR"),
                hint: "volume do período",
              },
              {
                label: "Itens médios",
                value: data.avgItemsPerOrder.toLocaleString("pt-BR"),
                hint: `${data.itemCount.toLocaleString("pt-BR")} itens no total`,
              },
              {
                label: "Ticket médio",
                value: formatMoney(ticketAvg),
                hint: formatMoney(data.totalCents) + " total",
              },
              {
                label: "Tempo médio aberta",
                value: data.avgOpenMinutes > 0 ? `${data.avgOpenMinutes} min` : "—",
                hint: "só fechadas",
              },
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
              period: period.period,
              status: data.status !== "all" ? data.status : undefined,
            }}
          />
        </div>
      </section>
    </>
  );
}
