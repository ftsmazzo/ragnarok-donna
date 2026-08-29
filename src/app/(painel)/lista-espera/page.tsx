import { PageHeader } from "@/components/shell/PageHeader";
import { FilterTabs } from "@/components/cadastro/FilterTabs";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { listWaitlist, type WaitlistFilter } from "@/lib/waitlist";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatPhone, labelWaitlistStatus } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ filter?: string }>;
};

function filterHref(filter: WaitlistFilter) {
  return filter === "waiting" ? "/lista-espera" : `/lista-espera?filter=${filter}`;
}

export default async function ListaEsperaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filter = (sp.filter as WaitlistFilter) || "waiting";
  const data = await listWaitlist({ filter });

  return (
    <>
      <PageHeader
        title="Lista de espera"
        subtitle={`${data.waitingCount} aguardando · ${data.notifiedCount} notificado(s)`}
      />

      <p className="client-profile-hint banner-info banner-inline" style={{ marginBottom: 12 }}>
        A espera é gerida pela <strong>Donna</strong>: quando o horário pedido está ocupado, ela
        sugere alternativas e, se o cliente aceitar esperar, usa a skill{" "}
        <code>add_to_waitlist</code>. Se alguém cancelar (Zap ou painel), a Donna avisa o primeiro
        da fila e pergunta se pode agendar.
      </p>
      <SummaryCards
        cards={[
          { label: "Aguardando encaixe", value: data.waitingCount },
          { label: "Já notificados", value: data.notifiedCount },
          { label: "Exibindo", value: data.total },
        ]}
      />

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-toolbar">
          <FilterTabs
            tabs={[
              {
                label: "Aguardando",
                href: filterHref("waiting"),
                active: filter === "waiting",
              },
              {
                label: "Notificados",
                href: filterHref("notified"),
                active: filter === "notified",
              },
              { label: "Todos", href: filterHref("all"), active: filter === "all" },
            ]}
          />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Telefone</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th>Data desejada</th>
                <th>Status</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    Nenhum registro na lista de espera.
                  </td>
                </tr>
              ) : (
                data.rows.map((w) => (
                  <tr key={w.id}>
                    <td className="cell-strong">{formatPhone(w.phone)}</td>
                    <td>{w.clientName ?? "—"}</td>
                    <td>{w.serviceName ?? "—"}</td>
                    <td>{w.staffName ?? "—"}</td>
                    <td>{w.desiredDate ? formatDateTimeSp(w.desiredDate) : "—"}</td>
                    <td>
                      <span
                        className={`badge${
                          w.status === "waiting" ? " is-warn" : " is-success"
                        }`}
                      >
                        {labelWaitlistStatus(w.status)}
                      </span>
                    </td>
                    <td>{w.notes ?? "—"}</td>
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
