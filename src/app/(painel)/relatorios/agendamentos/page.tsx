import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { StatusBarChart } from "@/components/relatorio/charts";
import { reportAppointments } from "@/lib/relatorios";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelApptStatus } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

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

export default async function RelatorioAgendamentosPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/agendamentos", sp);
  const data = await reportAppointments({
    from: sp.from,
    to: sp.to,
    status: sp.status,
    q: sp.q,
    page: Number(sp.page) || 1,
  });

  const statusChart = Object.entries(data.byStatus)
    .filter(([k]) => k !== "blocked")
    .map(([status, n]) => ({
      name: labelApptStatus(status),
      value: Number(n),
    }));

  return (
    <>
      <PageHeader
        title="Relatório de Agendamentos"
        subtitle={`${data.total.toLocaleString("pt-BR")} agendamento(s) no período`}
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
            action="/relatorios/agendamentos"
            from={data.from}
            to={data.to}
            q={data.q}
            showSearch
          >
            <label className="filter-field">
              <span>Status</span>
              <select name="status" defaultValue={data.status} className="search-input">
                <option value="all">Todos</option>
                <option value="scheduled">Agendado</option>
                <option value="confirmed">Confirmado</option>
                <option value="completed">Realizado</option>
                <option value="cancelled">Cancelado</option>
                <option value="no_show">Ausente</option>
                <option value="blocked">Bloqueio</option>
              </select>
            </label>
          </RelatorioFilters>
        </div>

        <div className="panel-body-flush">
          <SummaryCards
            cards={[
              { label: "Total", value: data.total.toLocaleString("pt-BR") },
              {
                label: "Realizados",
                value: (data.byStatus.completed ?? 0).toLocaleString("pt-BR"),
              },
              {
                label: "Cancelados",
                value: (data.byStatus.cancelled ?? 0).toLocaleString("pt-BR"),
              },
              {
                label: "Ausentes",
                value: (data.byStatus.no_show ?? 0).toLocaleString("pt-BR"),
              },
            ]}
          />

          <div className="dash-panel-inner" style={{ margin: "8px 12px 16px" }}>
            <h3 className="section-title section-title-inset">Distribuição por status</h3>
            <StatusBarChart data={statusChart} />
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Cliente</th>
                  <th>Profissional</th>
                  <th>Serviço</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Nenhum agendamento no período.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {formatDateTimeSp(a.startsAt)}
                        {a.isEncaixe ? " · encaixe" : ""}
                      </td>
                      <td className="cell-strong">{a.clientName ?? "—"}</td>
                      <td>{a.staffName ?? "—"}</td>
                      <td>{a.serviceName ?? "—"}</td>
                      <td>{a.priceCents != null ? formatMoney(a.priceCents) : "—"}</td>
                      <td>
                        <span className="badge is-muted">{labelApptStatus(a.status)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-footer">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            basePath="/relatorios/agendamentos"
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
