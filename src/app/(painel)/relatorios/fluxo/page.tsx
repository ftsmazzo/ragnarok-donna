import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { PaymentMixDonut, RevenueAreaChart } from "@/components/relatorio/charts";
import { getCashFlowReport } from "@/server/commissions";
import { resolveReportPeriod } from "@/lib/datetime";
import { formatMoney, labelPaymentMethod } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
};

function deltaLabel(pct: number | null): string | null {
  if (pct == null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("pt-BR")}% vs ant.`;
}

export default async function FluxoCaixaPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/fluxo", sp);
  const period = resolveReportPeriod({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });
  const data = await getCashFlowReport({ from: period.from, to: period.to });

  const mix = data.byMethod.map((m) => ({
    name: labelPaymentMethod(m.name),
    value: m.value,
    extra: m.extra,
  }));

  return (
    <>
      <PageHeader
        title="Raio-X financeiro"
        subtitle={`Fluxo ${data.from} → ${data.to} · vs ${data.previous.prevFrom} → ${data.previous.prevTo}`}
        actions={
          <>
            <Link href="/caixa" className="btn btn-outline">
              Caixa do dia
            </Link>
            <Link href="/contas" className="btn btn-outline">
              Contas
            </Link>
            <ExportCsvButton
              filename={`fluxo_${data.from}_${data.to}`}
              headers={["Forma", "Total R$", "Qtd"]}
              rows={data.byMethod.map((m) => [
                labelPaymentMethod(m.name),
                Number(m.value).toFixed(2),
                m.extra ?? "",
              ])}
            />
          </>
        }
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/relatorios/fluxo"
            period={period.period}
            from={data.from}
            to={data.to}
          />
          <RelatorioFilters
            action="/relatorios/fluxo"
            from={data.from}
            to={data.to}
            hidden={{ period: "custom" }}
          />
        </div>
      </section>

      {data.totalMovedCents === 0 && data.cashInCents === 0 && data.cashOutCents === 0 ? (
        <p className="empty-decision" style={{ marginBottom: 12 }}>
          Sem movimentação no período — feche comandas no Caixa para alimentar o fluxo.
        </p>
      ) : null}

      <SummaryCards
        cards={[
          {
            label: "Entradas",
            value: formatMoney(data.cashInCents),
            hint: "suprimentos + pagamentos no caixa",
            delta: deltaLabel(data.previous.cashInDeltaPct),
          },
          {
            label: "Saídas",
            value: formatMoney(data.cashOutCents),
            hint: "sangrias + vales no caixa",
            delta: deltaLabel(data.previous.cashOutDeltaPct),
          },
          {
            label: "Vales",
            value: formatMoney(data.valeCents),
            hint: `${data.valeCount} lançamento(s)`,
            delta: deltaLabel(data.previous.valeDeltaPct),
          },
          {
            label: "Líquido",
            value: formatMoney(data.netCents),
            hint: "entradas − saídas do caixa",
            delta: deltaLabel(data.previous.netDeltaPct),
          },
        ]}
      />

      <div style={{ marginTop: 12 }}>
        <SummaryCards
          cards={[
            {
              label: "Total movimentado",
              value: formatMoney(data.totalMovedCents),
              hint: "pagamentos no período",
              delta: deltaLabel(data.previous.movedDeltaPct),
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
          ]}
        />
      </div>

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

      <p className="muted-note" style={{ marginTop: 12 }}>
        Disponível é leitura gerencial (sem taxas de adquirente). Vales entram em{" "}
        <Link href="/comissoes">Comissões</Link> e, se lançados com caixa aberto, também nas
        saídas. Orçamento de compras:{" "}
        <Link href="/configuracoes/empresa">Empresa</Link>.
      </p>
    </>
  );
}
