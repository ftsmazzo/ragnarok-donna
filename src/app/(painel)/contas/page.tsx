import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { reportContas } from "@/lib/contas";
import { formatDateTimeSp, resolveReportPeriod } from "@/lib/datetime";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
};

export default async function ContasPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/contas", sp);
  const period = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const data = await reportContas({ from: period.from, to: period.to });

  return (
    <>
      <PageHeader
        title="Contas"
        subtitle="Conta Cliente (fiado/crédito) · vales · cartão e comandas abertas são só informativos"
        actions={
          <>
            <Link href="/caixa" className="btn btn-outline">
              Caixa
            </Link>
            <Link href="/clientes?filter=fiado" className="btn btn-outline">
              Fiado
            </Link>
            <Link href="/comissoes" className="btn btn-outline">
              Comissões
            </Link>
            <ExportCsvButton
              filename={`contas_${data.from}_${data.to}`}
              headers={["Tipo", "Cliente/Descrição", "Telefone", "Valor R$"]}
              rows={[
                ...data.debtors.map((c) => [
                  "débito",
                  c.name,
                  c.phone ?? "",
                  (Math.abs(c.balanceCents) / 100).toFixed(2),
                ]),
                ...data.creditors.map((c) => [
                  "crédito",
                  c.name,
                  c.phone ?? "",
                  (c.balanceCents / 100).toFixed(2),
                ]),
                ...data.openAdvances.map((a) => [
                  "a pagar",
                  `${a.staffName ?? "—"} · ${a.kind}${a.notes ? ` · ${a.notes}` : ""}`,
                  "",
                  (a.amountCents / 100).toFixed(2),
                ]),
                ...data.cashOut.map((m) => [
                  "saída",
                  m.description ?? labelPaymentMethod(m.method ?? "other"),
                  "",
                  (m.amountCents / 100).toFixed(2),
                ]),
              ]}
            />
          </>
        }
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/contas"
            period={period.period}
            from={data.from}
            to={data.to}
          />
          <RelatorioFilters
            action="/contas"
            from={data.from}
            to={data.to}
            hidden={{ period: "custom" }}
          />
        </div>
      </section>

      <SummaryCards
        cards={[
          {
            label: "A pagar (vales/abertos)",
            value: formatMoney(data.payableCents),
            hint: `${data.openAdvances.length} lançamento(s) em aberto`,
          },
          {
            label: "A receber (fiado)",
            value: formatMoney(data.receivableCents),
            hint:
              data.clientDebtCount > 0
                ? `${data.clientDebtCount} cliente(s) com saldo negativo`
                : "Nenhum cliente em débito",
          },
          {
            label: "Crédito em conta",
            value: formatMoney(data.clientCreditCents),
            hint: `${data.clientCreditCount} cliente(s) com saldo positivo`,
          },
          {
            label: "Cartão crédito (período)",
            value: formatMoney(data.cardCreditCents),
            hint: `${data.cardCreditCount} na maquininha — já recebido`,
          },
        ]}
      />
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
        Comandas abertas (&gt; R$0): {formatMoney(data.openOrdersCents)} (
        {data.openOrdersCount}) — ticket/agenda, não é dívida. Saídas de caixa no
        período: {formatMoney(data.outCents)}.
      </p>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-toolbar">
          <strong>A receber — clientes em débito (Conta Cliente)</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {formatMoney(data.clientDebtCents)} · {data.debtors.length} listado(s)
          </span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Saldo (deve)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.debtors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-empty">
                    Nenhum cliente com fiado em aberto.
                  </td>
                </tr>
              ) : (
                data.debtors.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.name}</td>
                    <td>{c.phone ?? "—"}</td>
                    <td>{formatMoney(Math.abs(c.balanceCents))}</td>
                    <td>
                      <Link href={`/clientes?id=${c.id}`} className="btn btn-ghost btn-sm">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-toolbar">
          <strong>Crédito em conta — clientes com saldo positivo</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            {formatMoney(data.clientCreditCents)} · {data.creditors.length}{" "}
            listado(s)
          </span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Saldo (crédito)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.creditors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-empty">
                    Nenhum cliente com crédito em conta.
                  </td>
                </tr>
              ) : (
                data.creditors.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.name}</td>
                    <td>{c.phone ?? "—"}</td>
                    <td>{formatMoney(c.balanceCents)}</td>
                    <td>
                      <Link href={`/clientes?id=${c.id}`} className="btn btn-ghost btn-sm">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="dash-grid" style={{ marginTop: 12 }}>
        <section className="panel">
          <div className="panel-toolbar">
            <strong>Contas a pagar — vales e adiantamentos abertos</strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Quando</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {data.openAdvances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      Nenhum vale aberto. Lance em Comissões se precisar.
                    </td>
                  </tr>
                ) : (
                  data.openAdvances.map((a) => (
                    <tr key={a.id}>
                      <td className="cell-strong">{a.staffName ?? "—"}</td>
                      <td>{a.kind}</td>
                      <td>{formatMoney(a.amountCents)}</td>
                      <td>{formatDateTimeSp(a.occurredAt)}</td>
                      <td>{a.notes ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-toolbar">
            <strong>Saídas de caixa no período</strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Descrição</th>
                  <th>Método</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.cashOut.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="table-empty">
                      Sem saídas registradas no Caixa neste período.
                    </td>
                  </tr>
                ) : (
                  data.cashOut.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateTimeSp(m.createdAt)}</td>
                      <td>{m.description ?? "—"}</td>
                      <td>{m.method ? labelPaymentMethod(m.method) : "—"}</td>
                      <td>{formatMoney(m.amountCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
