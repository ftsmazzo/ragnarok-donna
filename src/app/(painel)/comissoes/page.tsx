import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { reportCommissions } from "@/lib/comissoes";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import {
  commissionsScope,
  requireOwnStaffId,
  requirePageAccess,
} from "@/server/permissions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; staff?: string; page?: string }>;
};

export default async function ComissoesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const session = await requirePageAccess("/comissoes", sp);

  const scope = commissionsScope(session.role);
  let forcedStaffId: string | undefined;

  if (scope === "own") {
    forcedStaffId = await requireOwnStaffId(session);
  }

  const staffFilter = forcedStaffId ?? (sp.staff || undefined);

  const data = await reportCommissions({
    from: sp.from,
    to: sp.to,
    staffId: staffFilter,
    page: Number(sp.page) || 1,
  });

  const ownOnly = Boolean(forcedStaffId);

  return (
    <>
      <PageHeader
        title={ownOnly ? "Minhas comissões" : "Comissões"}
        subtitle={`${data.totalItems.toLocaleString("pt-BR")} item(ns) · ${formatMoney(data.totalCommissionCents)} em comissões`}
        actions={
          ownOnly ? undefined : (
            <>
              <button type="button" className="btn btn-outline" disabled title="Em breve">
                Excel
              </button>
              <button type="button" className="btn btn-outline" disabled title="Em breve">
                PDF
              </button>
            </>
          )
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <RelatorioFilters action="/comissoes" from={data.from} to={data.to}>
            {!ownOnly ? (
              <label className="filter-field">
                <span>Profissional</span>
                <select name="staff" defaultValue={data.staffId} className="search-input">
                  <option value="">Todos</option>
                  {data.staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </RelatorioFilters>
        </div>

        <div className="panel-body-flush">
          <SummaryCards
            cards={[
              { label: "Faturamento itens", value: formatMoney(data.totalRevenueCents) },
              { label: "Comissões", value: formatMoney(data.totalCommissionCents) },
              ...(ownOnly
                ? []
                : [{ label: "Profissionais", value: data.byStaff.length }]),
            ]}
          />

          {!ownOnly ? (
            <>
              <h3 className="section-title section-title-inset">Sintético por profissional</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Profissional</th>
                      <th>Itens</th>
                      <th>Faturamento</th>
                      <th>Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byStaff.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="table-empty">
                          Nenhuma comissão no período.
                        </td>
                      </tr>
                    ) : (
                      data.byStaff.map((s) => (
                        <tr key={s.staffId ?? "none"}>
                          <td className="cell-strong">{s.staffName ?? "Sem profissional"}</td>
                          <td>{s.itemCount.toLocaleString("pt-BR")}</td>
                          <td>{formatMoney(s.revenueCents)}</td>
                          <td>{formatMoney(s.commissionCents)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <h3 className="section-title section-title-inset">Analítico</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  {!ownOnly ? <th>Profissional</th> : null}
                  <th>Cliente</th>
                  <th>Item</th>
                  <th>Valor</th>
                  <th>Comissão</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={ownOnly ? 5 : 6} className="table-empty">
                      Nenhum item no período.
                    </td>
                  </tr>
                ) : (
                  data.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.performedAt ? formatDateTimeSp(i.performedAt) : "—"}</td>
                      {!ownOnly ? <td>{i.staffName ?? "—"}</td> : null}
                      <td>{i.clientName ?? "—"}</td>
                      <td>{i.description}</td>
                      <td>{formatMoney(i.totalCents)}</td>
                      <td>{formatMoney(i.commissionCents)}</td>
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
            basePath="/comissoes"
            params={{
              from: data.from,
              to: data.to,
              staff: ownOnly ? undefined : data.staffId || undefined,
            }}
          />
        </div>
      </section>
    </>
  );
}
