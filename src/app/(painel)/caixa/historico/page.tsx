import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { listCashSessions } from "@/server/finance";
import { requirePageAccess } from "@/server/permissions/page-access";
import { formatMoney } from "@/lib/format";
import { daysAgoSp, formatDateTimeSp, resolveReportPeriod, todaySp } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
};

export default async function CaixaHistoricoPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/caixa/historico", sp);
  const period = resolveReportPeriod({
    period: sp.period ?? "last30",
    from: sp.from,
    to: sp.to,
  });
  const sessions = await listCashSessions({
    from: period.from,
    to: period.to,
  });

  return (
    <>
      <PageHeader
        title="Histórico de caixa"
        subtitle={`${period.from} → ${period.to}`}
        actions={
          <Link href={`/caixa?date=${todaySp()}`} className="btn btn-primary">
            Caixa de hoje
          </Link>
        }
      />

      <section className="panel">
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <RelatorioFilters
            action="/caixa/historico"
            from={period.from}
            to={period.to}
            hidden={{ period: "custom" }}
          />
          <Link
            href={`/caixa/historico?period=last7&from=${daysAgoSp(6)}&to=${todaySp()}`}
            className="btn btn-outline btn-sm"
          >
            7 dias
          </Link>
          <Link
            href={`/caixa/historico?period=last30`}
            className="btn btn-outline btn-sm"
          >
            30 dias
          </Link>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Abertura</th>
                <th>Fechamento</th>
                <th>Status</th>
                <th>Abriu</th>
                <th>Fechou</th>
                <th style={{ textAlign: "right" }}>Abertura R$</th>
                <th style={{ textAlign: "right" }}>Fechamento R$</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Nenhuma sessão no período.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const date = s.openedAt
                    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
                  return (
                    <tr key={s.id}>
                      <td>{formatDateTimeSp(s.openedAt)}</td>
                      <td>{s.closedAt ? formatDateTimeSp(s.closedAt) : "—"}</td>
                      <td>
                        <span className={s.isOpen ? "badge badge-success" : "badge"}>
                          {s.isOpen ? "Aberto" : "Fechado"}
                        </span>
                      </td>
                      <td>{s.openedByName ?? "—"}</td>
                      <td>{s.closedByName ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{formatMoney(s.openingCents)}</td>
                      <td style={{ textAlign: "right" }}>
                        {s.closingCents != null ? formatMoney(s.closingCents) : "—"}
                      </td>
                      <td>
                        <Link href={`/caixa?date=${date}`} className="btn btn-outline btn-sm">
                          Abrir dia
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
