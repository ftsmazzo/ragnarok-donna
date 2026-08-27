import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { PaymentMixDonut, RevenueAreaChart } from "@/components/relatorio/charts";
import { getCashFlowReport } from "@/server/commissions";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function FluxoCaixaPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/fluxo", sp);
  const data = await getCashFlowReport({ from: sp.from, to: sp.to });

  const mix = data.byMethod.map((m) => ({
    name: labelPaymentMethod(m.name),
    value: m.value,
    extra: m.extra,
  }));

  return (
    <>
      <PageHeader
        title="Fluxo de caixa"
        subtitle={`Movimentado ${formatMoney(data.totalMovedCents)} · ${data.from} → ${data.to}`}
        actions={
          <Link href="/caixa" className="btn btn-outline">
            Caixa do dia
          </Link>
        }
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar">
          <RelatorioFilters action="/relatorios/fluxo" from={data.from} to={data.to} />
        </div>
      </section>

      <SummaryCards
        cards={[
          {
            label: "Total movimentado",
            value: formatMoney(data.totalMovedCents),
            hint: "pagamentos no período",
          },
          {
            label: "Disponível (aprox.)",
            value: formatMoney(data.availableCents),
            hint: "dinheiro + PIX + débito",
          },
          {
            label: "Cartão crédito",
            value: formatMoney(data.creditCents),
            hint: "a receber / liquidar",
          },
          {
            label: "Vales",
            value: formatMoney(data.valeCents),
            hint: `${data.valeCount} lançamento(s)`,
          },
        ]}
      />

      <div className="dash-grid" style={{ marginTop: 12 }}>
        <section className="panel dash-panel">
          <div className="panel-toolbar">
            <strong>Entradas no tempo</strong>
          </div>
          <div className="panel-body">
            <RevenueAreaChart data={data.series} />
          </div>
        </section>
        <section className="panel dash-panel">
          <div className="panel-toolbar">
            <strong>Mix por forma</strong>
          </div>
          <div className="panel-body">
            <PaymentMixDonut data={mix} />
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-toolbar">
          <strong>Caixa operacional no período</strong>
        </div>
        <div className="panel-body">
          <SummaryCards
            cards={[
              {
                label: "Entradas de caixa",
                value: formatMoney(data.cashInCents),
                hint: "suprimentos + pagamentos registrados",
              },
              {
                label: "Saídas de caixa",
                value: formatMoney(data.cashOutCents),
                hint: "sangrias + vales",
              },
              {
                label: "Saldo movimentos",
                value: formatMoney(data.cashInCents - data.cashOutCents),
              },
            ]}
          />
          <p className="muted-note" style={{ marginTop: 12 }}>
            Disponível é uma leitura gerencial (sem taxas de adquirente). Vales entram no
            relatório de <Link href="/comissoes">Comissões</Link> e, se lançados com caixa
            aberto, também nas saídas do caixa.
          </p>
        </div>
      </section>
    </>
  );
}
