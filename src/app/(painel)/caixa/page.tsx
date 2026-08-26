import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { getCaixaDay } from "@/lib/caixa";
import { formatDateLabelSp, formatDateTimeSp, shiftDateSp, todaySp } from "@/lib/datetime";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ date?: string }>;
};

export default async function CaixaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await getCaixaDay(sp.date);
  const prev = shiftDateSp(data.date, -1);
  const next = shiftDateSp(data.date, 1);
  const isToday = data.date === todaySp();

  return (
    <>
      <PageHeader
        title="Caixa"
        subtitle={formatDateLabelSp(data.date)}
        actions={
          <>
            <Link
              href={`/caixa?date=${todaySp()}`}
              className={`btn btn-outline${isToday ? " is-active-tab" : ""}`}
            >
              Hoje
            </Link>
            <Link href={`/caixa?date=${prev}`} className="btn btn-outline">
              ← Anterior
            </Link>
            <Link href={`/caixa?date=${next}`} className="btn btn-outline">
              Próximo →
            </Link>
          </>
        }
      />

      {!data.hasImportedSessions ? (
        <div className="info-banner">
          Caixa derivado dos <strong>pagamentos de comandas</strong> — sessões do AppBarber
          ainda não importadas.
        </div>
      ) : null}

      <SummaryCards
        cards={[
          {
            label: "Entradas (pagamentos)",
            value: formatMoney(data.totalCents),
            hint: `${data.paymentCount} pagamento(s)`,
          },
          {
            label: "Comandas fechadas",
            value: data.closedOrdersCount,
            hint: formatMoney(data.closedOrdersCents),
          },
          {
            label: "Comandas abertas",
            value: data.openOrdersCount,
            hint: "do dia",
          },
        ]}
      />

      <div className="caixa-layout">
        <section className="panel">
          <div className="panel-toolbar">
            <strong>Entradas por forma de pagamento</strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Forma</th>
                  <th>Qtd</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.byMethod.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="table-empty">
                      Nenhum pagamento neste dia.
                    </td>
                  </tr>
                ) : (
                  data.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td className="cell-strong">{labelPaymentMethod(m.method)}</td>
                      <td>{m.count}</td>
                      <td>{formatMoney(m.totalCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-toolbar">
            <strong>Movimentações do dia</strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Comanda</th>
                  <th>Forma</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      Nenhuma movimentação.
                    </td>
                  </tr>
                ) : (
                  data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateTimeSp(p.paidAt)}</td>
                      <td>{p.clientName ?? "—"}</td>
                      <td>{p.orderExternalId ?? "—"}</td>
                      <td>{labelPaymentMethod(p.method)}</td>
                      <td>{formatMoney(p.amountCents)}</td>
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
