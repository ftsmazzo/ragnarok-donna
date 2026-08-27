import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { FollowUpActions } from "@/components/relatorio/FollowUpActions";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatPhone } from "@/lib/format";
import { reportPerfil } from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";
import { requireTenantContext } from "@/server/context/tenant";

export const dynamic = "force-dynamic";

type Tab = "retorno" | "recorrencia" | "servicos" | "produtos";

type Props = {
  searchParams: Promise<{
    tab?: string;
    serviceDays?: string;
    productDays?: string;
    recurrenceDays?: string;
    inactiveDays?: string;
  }>;
};

function parseTab(raw?: string): Tab {
  if (raw === "recorrencia" || raw === "servicos" || raw === "produtos") return raw;
  return "retorno";
}

export default async function RelatorioPerfilPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/perfil", sp);
  const tenant = await requireTenantContext();

  const serviceDays = Number(sp.serviceDays) || undefined;
  const productDays = Number(sp.productDays) || undefined;
  const recurrenceDays = Number(sp.recurrenceDays) || undefined;
  const inactiveDays = Number(sp.inactiveDays) || undefined;
  const data = await reportPerfil({
    serviceDays,
    productDays,
    recurrenceDays,
    inactiveDays,
  });
  const tab = parseTab(sp.tab);

  const q = `serviceDays=${data.serviceThresholdDays}&productDays=${data.productThresholdDays}&recurrenceDays=${data.recurrenceLapseDays}&inactiveDays=${data.inactiveDays}`;

  const uniqueService = new Set(data.serviceDue.map((r) => r.clientId)).size;
  const uniqueProduct = new Set(data.productDue.map((r) => r.clientId)).size;

  return (
    <>
      <PageHeader
        title="Ações e follow-up"
        subtitle="Filtros de retorno, recorrência e recompra — base pra mensagem da Donna"
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar">
          <form action="/relatorios/perfil" method="get" className="relatorio-filters">
            <input type="hidden" name="tab" value={tab} />
            <label className="filter-field">
              <span>Não retorna (dias)</span>
              <input
                type="number"
                name="inactiveDays"
                min={30}
                max={365}
                defaultValue={data.inactiveDays}
                className="search-input"
              />
            </label>
            <label className="filter-field">
              <span>Recorrência parada</span>
              <input
                type="number"
                name="recurrenceDays"
                min={21}
                max={180}
                defaultValue={data.recurrenceLapseDays}
                className="search-input"
              />
            </label>
            <label className="filter-field">
              <span>Ciclo serviço</span>
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
              <span>Recompra produto</span>
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
            label: "Não retornam",
            value: data.inactiveCount,
            hint: `${data.inactiveDays}d+ · follow-up`,
          },
          {
            label: "Recorrência parada",
            value: data.recurrenceLapsedCount,
            hint: `${data.recurrenceLapseDays}d+ sem renovar`,
          },
          {
            label: "Serviços a reoferecer",
            value: data.serviceDueCount,
            hint: `${uniqueService} cliente(s) · ${data.serviceThresholdDays}d`,
          },
          {
            label: "Produtos",
            value: data.productDueCount,
            hint: `${uniqueProduct} cliente(s)`,
          },
        ]}
      />

      <div className="panel-toolbar" style={{ marginTop: 12, marginBottom: 8, gap: 8 }}>
        <Link href={`/relatorios/perfil?tab=retorno&${q}`} className={`chip${tab === "retorno" ? " is-on" : ""}`}>
          Retorno {data.inactiveDays}d
        </Link>
        <Link
          href={`/relatorios/perfil?tab=recorrencia&${q}`}
          className={`chip${tab === "recorrencia" ? " is-on" : ""}`}
        >
          Recorrência {data.recurrenceLapseDays}d
        </Link>
        <Link href={`/relatorios/perfil?tab=servicos&${q}`} className={`chip${tab === "servicos" ? " is-on" : ""}`}>
          Serviços
        </Link>
        <Link href={`/relatorios/perfil?tab=produtos&${q}`} className={`chip${tab === "produtos" ? " is-on" : ""}`}>
          Produtos
        </Link>
      </div>

      {(tab === "retorno" || tab === "recorrencia") && (
        <section className="panel">
          <div className="panel-toolbar">
            <strong>
              {tab === "retorno"
                ? `Follow-up — sem voltar há ${data.inactiveDays}+ dias`
                : `Teve recorrência e não renovou há ${data.recurrenceLapseDays}+ dias`}
            </strong>
            <span className="badge is-muted">Msg pronta · Agendar IA na Sprint 6</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th>Último sinal</th>
                  <th>Há</th>
                  <th>Contexto</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {(tab === "retorno" ? data.inactiveClients : data.recurrenceLapsed).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Nenhum cliente neste filtro.
                    </td>
                  </tr>
                ) : (
                  (tab === "retorno" ? data.inactiveClients : data.recurrenceLapsed).map((r) => (
                    <tr key={`${r.reason}-${r.clientId}`}>
                      <td className="cell-strong">
                        <Link href={`/clientes?id=${r.clientId}`}>{r.clientName}</Link>
                      </td>
                      <td>{formatPhone(r.phone)}</td>
                      <td>{formatDateTimeSp(r.lastAt)}</td>
                      <td>{r.daysSince}d</td>
                      <td>{r.lastServiceName ?? "—"}</td>
                      <td>
                        <FollowUpActions row={r} tenantName={tenant.name} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(tab === "servicos" || tab === "produtos") && (
        <section className="panel">
          <div className="panel-toolbar">
            <strong>
              {tab === "servicos"
                ? `Serviços além do ciclo (${data.serviceThresholdDays}d) — sem categoria Recorrência`
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
      )}
    </>
  );
}
