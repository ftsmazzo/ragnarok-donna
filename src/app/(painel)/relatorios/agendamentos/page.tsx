import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { StatusBarChart } from "@/components/relatorio/charts";
import { reportAppointments } from "@/lib/relatorios";
import { formatDateTimeSp, resolveReportPeriod } from "@/lib/datetime";
import { formatMoney, labelApptStatus } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    period?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function RelatorioAgendamentosPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/agendamentos", sp);
  const period = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const data = await reportAppointments({
    from: period.from,
    to: period.to,
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

  const confirmed =
    (data.byStatus.confirmed ?? 0) +
    (data.byStatus.scheduled ?? 0) +
    (data.byStatus.arrived ?? 0) +
    (data.byStatus.in_progress ?? 0);
  const cancelled = data.byStatus.cancelled ?? 0;
  const noShow = data.byStatus.no_show ?? 0;
  const completed = data.byStatus.completed ?? 0;
  const denom = Math.max(1, data.total);
  const maxHeat = Math.max(1, ...data.hourHeatmap.map((h) => h.count));

  return (
    <>
      <PageHeader
        title="Agendamentos"
        subtitle={`${data.total.toLocaleString("pt-BR")} no período · taxas de realização e falhas`}
        actions={
          <ExportCsvButton
            filename={`agendamentos_${data.from}_${data.to}`}
            headers={["Data", "Cliente", "Profissional", "Serviço", "Valor", "Status"]}
            rows={data.rows.map((a) => [
              formatDateTimeSp(a.startsAt),
              a.clientName,
              a.staffName,
              a.serviceName,
              a.priceCents != null ? (a.priceCents / 100).toFixed(2) : "",
              labelApptStatus(a.status),
            ])}
          />
        }
      />

      <section className="panel">
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/relatorios/agendamentos"
            period={period.period}
            from={data.from}
            to={data.to}
            extraParams={{
              status: data.status !== "all" ? data.status : undefined,
              q: data.q || undefined,
            }}
          />
          <RelatorioFilters
            action="/relatorios/agendamentos"
            from={data.from}
            to={data.to}
            q={data.q}
            showSearch
            hidden={{ period: "custom" }}
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
              {
                label: "Total",
                value: data.total.toLocaleString("pt-BR"),
                hint: "o que entrou na agenda",
              },
              {
                label: "Realizados",
                value: `${completed.toLocaleString("pt-BR")} (${Math.round((completed / denom) * 100)}%)`,
                hint: "já concluídos",
              },
              {
                label: "Em aberto / confirmados",
                value: confirmed.toLocaleString("pt-BR"),
                hint: "ainda na fila",
              },
              {
                label: "Cancelados + no-show",
                value: `${(cancelled + noShow).toLocaleString("pt-BR")} (${Math.round(((cancelled + noShow) / denom) * 100)}%)`,
                hint: `${cancelled} cancel. · ${noShow} ausentes`,
              },
            ]}
          />

          <div className="dash-grid" style={{ margin: "8px 12px 16px" }}>
            <div className="dash-panel-inner">
              <h3 className="section-title section-title-inset">Distribuição por status</h3>
              {statusChart.length === 0 ? (
                <p className="empty-decision">Sem agendamentos no período — confira a Agenda.</p>
              ) : (
                <StatusBarChart data={statusChart} />
              )}
            </div>
            <div className="dash-panel-inner">
              <h3 className="section-title section-title-inset">Horários mais cheios (8h–19h)</h3>
              <div className="heatmap" aria-label="Heatmap de horários">
                {data.hourHeatmap.map((h) => {
                  const intensity = h.count / maxHeat;
                  const bg = `rgba(180, 83, 9, ${0.12 + intensity * 0.75})`;
                  return (
                    <div
                      key={h.hour}
                      className="heatmap-cell"
                      style={{ background: bg }}
                      title={`${String(h.hour).padStart(2, "0")}h: ${h.count}`}
                    >
                      <strong>{String(h.hour).padStart(2, "0")}</strong>
                      <span>{h.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
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
                      Nenhum agendamento no período. Ajuste o filtro ou abra a Agenda para
                      lançar.
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
              period: period.period,
              status: data.status !== "all" ? data.status : undefined,
              q: data.q || undefined,
            }}
          />
        </div>
      </section>
    </>
  );
}
