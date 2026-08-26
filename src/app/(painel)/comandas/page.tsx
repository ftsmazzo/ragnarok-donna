import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { OrdersTable } from "@/components/comandas/OrdersTable";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { listOpenOrders } from "@/lib/comandas";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ComandasPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await listOpenOrders({ q: sp.q });

  return (
    <>
      <PageHeader
        title="Comandas abertas"
        subtitle={`${data.total} comanda(s) em aberto · ${formatMoney(data.totalCents)}`}
        actions={
          <button type="button" className="btn btn-primary" disabled title="Em breve">
            + Nova comanda
          </button>
        }
      />

      <SummaryCards
        cards={[
          { label: "Comandas abertas", value: data.total },
          { label: "Valor em aberto", value: formatMoney(data.totalCents) },
        ]}
      />

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-toolbar">
          <CadastroSearch action="/comandas" q={data.q} placeholder="Cliente ou código" />
        </div>
        <OrdersTable rows={data.rows} showClosed={false} />
      </section>
    </>
  );
}
