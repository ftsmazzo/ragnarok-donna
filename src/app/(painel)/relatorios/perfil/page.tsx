import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatPhone } from "@/lib/format";
import { reportPerfil } from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    tab?: string;
    serviceDays?: string;
    productDays?: string;
  }>;
};

export default async function RelatorioPerfilPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/perfil", sp);

  const serviceDays = Number(sp.serviceDays) || undefined;
  const productDays = Number(sp.productDays) || undefined;
  const data = await reportPerfil({ serviceDays, productDays });
  const tab = sp.tab === "produtos" ? "produtos" : "servicos";

  const uniqueService = new Set(data.serviceDue.map((r) => r.clientId)).size;
  const uniqueProduct = new Set(data.productDue.map((r) => r.clientId)).size;

  return (
    <>
      <PageHeader
        title="Relatório Gerencial — Perfil"
        subtitle="Recompra e recorrência — quem abordar esta semana"
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar">
          <form action="/relatorios/perfil" method="get" className="relatorio-filters">
            <input type="hidden" name="tab" value={tab} />
            <label className="filter-field">
              <span>Ciclo serviço (dias)</span>
              <input
                type="number"
                name="serviceDays"
                min={7}
                max={180}
                defaultValue={data.serviceThresholdDays}
                className="search-input"
              />
            </label>
            <label className="filter-field">
              <span>Recompra produto (dias)</span>
              <input
                type="number"
                name="productDays"
                min={14}
                max={365}
                defaultValue={data.productThresholdDays}
                className="search-input"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Atualizar
            </button>
          </form>
        </div>
      </section>

      <SummaryCards
        cards={[
          {
            label: "Serviços a reoferecer",
            value: data.serviceDueCount,
            hint: `${uniqueService} cliente(s)`,
          },
          {
            label: "Produtos a reoferecer",
            value: data.productDueCount,
            hint: `${uniqueProduct} cliente(s)`,
          },
          {
            label: "Estoque baixo",
            value: data.lowStockCount,
            hint: "stock ≤ mínimo",
          },
        ]}
      />

      <div className="panel-toolbar" style={{ marginTop: 12, marginBottom: 8, gap: 8 }}>
        <Link
          href={`/relatorios/perfil?tab=servicos&serviceDays=${data.serviceThresholdDays}&productDays=${data.productThresholdDays}`}
          className={`chip${tab === "servicos" ? " is-on" : ""}`}
        >
          Serviços
        </Link>
        <Link
          href={`/relatorios/perfil?tab=produtos&serviceDays=${data.serviceThresholdDays}&productDays=${data.productThresholdDays}`}
          className={`chip${tab === "produtos" ? " is-on" : ""}`}
        >
          Produtos
        </Link>
      </div>

      <section className="panel">
        <div className="panel-toolbar">
          <strong>
            {tab === "servicos"
              ? `Serviços além do ciclo (${data.serviceThresholdDays}d padrão)`
              : `Produtos sem recompra (${data.productThresholdDays}d+)`}
          </strong>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>{tab === "servicos" ? "Serviço" : "Produto"}</th>
                <th>Última vez</th>
                <th>Há (dias)</th>
                <th>Limite</th>
              </tr>
            </thead>
            <tbody>
              {(tab === "servicos" ? data.serviceDue : data.productDue).length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Nenhum alerta neste filtro.
                  </td>
                </tr>
              ) : (
                (tab === "servicos" ? data.serviceDue : data.productDue).map((r) => (
                  <tr key={`${r.clientId}-${r.catalogId}`}>
                    <td className="cell-strong">
                      <Link href={`/clientes?id=${r.clientId}`}>{r.clientName}</Link>
                    </td>
                    <td>{formatPhone(r.phone)}</td>
                    <td>{r.catalogName}</td>
                    <td>{formatDateTimeSp(r.lastAt)}</td>
                    <td>{r.daysSince}</td>
                    <td>{r.thresholdDays}d</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
