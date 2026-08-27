import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { FollowUpActions } from "@/components/relatorio/FollowUpActions";
import { ExportCsvButton } from "@/components/relatorio/ExportCsvButton";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatPhone } from "@/lib/format";
import { buildOperationalAlerts, reportPerfil } from "@/server/insights";
import { requirePageAccess } from "@/server/permissions/page-access";
import { requireTenantContext } from "@/server/context/tenant";

export const dynamic = "force-dynamic";

type Tab = "retorno" | "recorrencia" | "servicos" | "produtos" | "voltaram";

type Props = {
  searchParams: Promise<{
    tab?: string;
    serviceDays?: string;
    productDays?: string;
    recurrenceDays?: string;
    inactiveDays?: string;
    windowDays?: string;
  }>;
};

function parseTab(raw?: string): Tab {
  if (
    raw === "recorrencia" ||
    raw === "servicos" ||
    raw === "produtos" ||
    raw === "voltaram"
  ) {
    return raw;
  }
  return "retorno";
}

export default async function RelatorioPerfilPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/relatorios/perfil", sp);
  const tenant = await requireTenantContext();

  const [data, alerts] = await Promise.all([
    reportPerfil({
      serviceDays: Number(sp.serviceDays) || undefined,
      productDays: Number(sp.productDays) || undefined,
      recurrenceDays: Number(sp.recurrenceDays) || undefined,
      inactiveDays: Number(sp.inactiveDays) || undefined,
      inactiveWindowDays: Number(sp.windowDays) || undefined,
    }),
    buildOperationalAlerts(),
  ]);
  const tab = parseTab(sp.tab);

  const q =
    `serviceDays=${data.serviceThresholdDays}` +
    `&productDays=${data.productThresholdDays}` +
    `&recurrenceDays=${data.recurrenceLapseDays}` +
    `&inactiveDays=${data.inactiveDays}` +
    `&windowDays=${data.inactiveWindowDays}`;

  const uniqueService = new Set(data.serviceDue.map((r) => r.clientId)).size;
  const uniqueProduct = new Set(data.productDue.map((r) => r.clientId)).size;
  const returned = alerts.returnedClients;
  const renewalsCount = alerts.summary.renewalsWeek;

  return (
    <>
      <PageHeader
        title="Perfil do cliente"
        subtitle={`Retorno, renovações e quem voltou esta semana · Donna no WhatsApp`}
        actions={
          tab === "retorno" || tab === "recorrencia" ? (
            <ExportCsvButton
              filename={`perfil_${tab}`}
              headers={["Cliente", "Dias", "Última visita", "Serviço", "Telefone"]}
              rows={(tab === "retorno" ? data.inactiveClients : data.recurrenceLapsed).map(
                (r) => [
                  r.clientName,
                  r.daysSince,
                  formatDateTimeSp(r.lastAt),
                  r.lastServiceName,
                  r.phone,
                ]
              )}
            />
          ) : tab === "voltaram" ? (
            <ExportCsvButton
              filename="perfil_voltaram"
              headers={["Cliente", "Gap dias", "Telefone"]}
              rows={returned.map((r) => [r.clientName, r.gapDays, r.phone])}
            />
          ) : undefined
        }
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar">
          <form action="/relatorios/perfil" method="get" className="relatorio-filters">
            <input type="hidden" name="tab" value={tab} />
            <label className="filter-field">
              <span>Mín. sem vir (dias)</span>
              <input
                type="number"
                name="inactiveDays"
                min={30}
                max={180}
                defaultValue={data.inactiveDays}
                className="search-input"
              />
            </label>
            <label className="filter-field">
              <span>Janela máx. (dias)</span>
              <input
                type="number"
                name="windowDays"
                min={60}
                max={365}
                defaultValue={data.inactiveWindowDays}
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
            label: "Na lista de retorno",
            value: data.inactiveCount,
            hint: `${data.inactiveDays}–${data.inactiveWindowDays}d · acione WhatsApp/Donna`,
          },
          {
            label: "Recorrência / renovações",
            value: data.recurrenceLapsedCount,
            hint: `${renewalsCount} renovaram esta semana`,
          },
          {
            label: "Perdidos que voltaram",
            value: returned.length,
            hint: "reapareceram após 60d+",
          },
          {
            label: "Serviços a reoferecer",
            value: data.serviceDueCount,
            hint: `${uniqueService} cliente(s) · ${uniqueProduct} c/ produto`,
          },
        ]}
      />

      <div className="panel-toolbar" style={{ marginTop: 12, marginBottom: 8, gap: 8 }}>
        <Link href={`/relatorios/perfil?tab=retorno&${q}`} className={`chip${tab === "retorno" ? " is-on" : ""}`}>
          Retorno
        </Link>
        <Link
          href={`/relatorios/perfil?tab=recorrencia&${q}`}
          className={`chip${tab === "recorrencia" ? " is-on" : ""}`}
        >
          Recorrência
        </Link>
        <Link
          href={`/relatorios/perfil?tab=voltaram&${q}`}
          className={`chip${tab === "voltaram" ? " is-on" : ""}`}
        >
          Voltaram esta semana
        </Link>
        <Link href={`/relatorios/perfil?tab=servicos&${q}`} className={`chip${tab === "servicos" ? " is-on" : ""}`}>
          Serviços
        </Link>
        <Link href={`/relatorios/perfil?tab=produtos&${q}`} className={`chip${tab === "produtos" ? " is-on" : ""}`}>
          Produtos
        </Link>
      </div>

      {tab === "voltaram" ? (
        <section className="panel">
          <div className="panel-toolbar">
            <strong>
              Clientes inativos que reapareceram esta semana ({returned.length})
            </strong>
            <Link href="/conversas" className="btn btn-outline btn-sm">
              Abrir Donna
            </Link>
          </div>
          <p className="muted-note" style={{ padding: "0 12px 8px" }}>
            Gap ≥ {data.inactiveDays} dias entre a visita anterior e a desta semana. Bom momento
            para reforçar o vínculo.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Gap</th>
                  <th>Telefone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {returned.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="table-empty">
                      Ninguém “perdido” voltou nesta semana.
                    </td>
                  </tr>
                ) : (
                  returned.map((r) => (
                    <tr key={r.clientId}>
                      <td className="cell-strong">
                        <Link href={`/clientes?id=${r.clientId}`}>{r.clientName}</Link>
                      </td>
                      <td>
                        <span className="days-away">{r.gapDays}</span>
                        <span className="days-away-unit"> dias</span>
                      </td>
                      <td>{formatPhone(r.phone)}</td>
                      <td>
                        <FollowUpActions
                          row={{
                            clientId: r.clientId,
                            clientName: r.clientName,
                            phone: r.phone,
                            lastAt: new Date(),
                            daysSince: r.gapDays,
                            thresholdDays: data.inactiveDays,
                            lastServiceName: null,
                            reason: "inactive",
                          }}
                          tenantName={tenant.name}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "retorno" ? (
        <section className="panel">
          <div className="panel-toolbar">
            <strong>
              Lista nominal — {data.inactiveCount.toLocaleString("pt-BR")} cliente(s)
            </strong>
            <Link href="/conversas" className="btn btn-outline btn-sm">
              Pedir follow-up à Donna
            </Link>
          </div>
          <p className="muted-note" style={{ padding: "0 12px 8px" }}>
            Já teve serviço, sem visita há {data.inactiveDays}–{data.inactiveWindowDays} dias.
            Use WhatsApp ou peça à Donna em Conversas IA.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Dias sem vir</th>
                  <th>Última visita</th>
                  <th>Último serviço</th>
                  <th>Telefone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.inactiveClients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Ninguém nesta janela — ajuste os dias ou aguarde novos lacunes.
                    </td>
                  </tr>
                ) : (
                  data.inactiveClients.map((r) => (
                    <tr key={r.clientId}>
                      <td className="cell-strong">
                        <Link href={`/clientes?id=${r.clientId}`}>{r.clientName}</Link>
                      </td>
                      <td>
                        <span className="days-away">{r.daysSince}</span>
                        <span className="days-away-unit"> dias</span>
                      </td>
                      <td>{formatDateTimeSp(r.lastAt)}</td>
                      <td>{r.lastServiceName ?? "—"}</td>
                      <td>{formatPhone(r.phone)}</td>
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
      ) : null}

      {tab === "recorrencia" ? (
        <section className="panel">
          <div className="panel-toolbar">
            <strong>
              Teve recorrência e não renovou há {data.recurrenceLapseDays}+ dias
            </strong>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Dias</th>
                  <th>Último sinal</th>
                  <th>Serviço</th>
                  <th>Telefone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.recurrenceLapsed.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Nenhum cliente neste filtro.
                    </td>
                  </tr>
                ) : (
                  data.recurrenceLapsed.map((r) => (
                    <tr key={r.clientId}>
                      <td className="cell-strong">
                        <Link href={`/clientes?id=${r.clientId}`}>{r.clientName}</Link>
                      </td>
                      <td>
                        <span className="days-away">{r.daysSince}</span>
                        <span className="days-away-unit"> dias</span>
                      </td>
                      <td>{formatDateTimeSp(r.lastAt)}</td>
                      <td>{r.lastServiceName ?? "—"}</td>
                      <td>{formatPhone(r.phone)}</td>
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
      ) : null}

      {(tab === "servicos" || tab === "produtos") && (
        <section className="panel">
          <div className="panel-toolbar">
            <strong>
              {tab === "servicos"
                ? `Serviços além do ciclo (${data.serviceThresholdDays}d)`
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
