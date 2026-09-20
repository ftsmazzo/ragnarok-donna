import Link from "next/link";
import { listCrmPipeline } from "@/server/crm/queries";
import { listCrmFrequency } from "@/server/crm/frequency";
import { CRM_EXITS, CRM_STAGES, labelCrmStage, labelHowHeard } from "@/lib/crm";
import { CRM_FREQUENCY, labelCrmFrequency } from "@/lib/crm-frequency";
import { formatDateTimeSp } from "@/lib/datetime";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ stage?: string; view?: string; freq?: string }>;
};

export default async function CrmPage({ searchParams }: Props) {
  await requirePageAccess("/crm");
  const sp = await searchParams;
  const view = sp.view === "retorno" ? "retorno" : "funil";

  if (view === "retorno") {
    return <CrmRetornoView freq={sp.freq?.trim() || "due"} />;
  }

  const stage = sp.stage?.trim() || "all";
  const data = await listCrmPipeline({ stage });

  const filters: { id: string; label: string }[] = [
    { id: "all", label: `Todos (${data.counts.all ?? 0})` },
    ...CRM_STAGES.map((s) => ({
      id: s.value,
      label: `${s.label} (${data.counts[s.value] ?? 0})`,
    })),
    { id: "exited", label: `Saídas (${data.counts.exited ?? 0})` },
  ];

  return (
    <div className="panel">
      <CrmHeader active="funil" />

      <nav className="filter-tabs" aria-label="Etapas do funil">
        {filters.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/crm" : `/crm?stage=${f.id}`}
            className={stage === f.id ? "filter-tab is-active" : "filter-tab"}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <p className="panel-empty">Ninguém nesta etapa ainda.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Etapa</th>
                <th>Origem</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/clientes?id=${r.id}`}>{r.name}</Link>
                  </td>
                  <td>{r.phone ?? "—"}</td>
                  <td>{r.crmStatus}</td>
                  <td>
                    {r.crmExit
                      ? `Saída: ${CRM_EXITS.find((e) => e.value === r.crmExit)?.label ?? r.crmExit}`
                      : labelCrmStage(r.crmStage)}
                  </td>
                  <td>
                    {labelHowHeard(r.howHeard)}
                    {r.campaign ? ` · ${r.campaign}` : ""}
                  </td>
                  <td>{formatDateTimeSp(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CrmHeader({ active }: { active: "funil" | "retorno" }) {
  return (
    <header className="panel-head">
      <div>
        <h1>CRM</h1>
        <p className="muted">
          Funil e ritmo de retorno dentro do painel Ragnarok — não é app separado.
        </p>
        <nav className="filter-tabs" aria-label="Visões do CRM" style={{ marginTop: 10 }}>
          <Link
            href="/crm"
            className={active === "funil" ? "filter-tab is-active" : "filter-tab"}
          >
            Funil
          </Link>
          <Link
            href="/crm?view=retorno"
            className={active === "retorno" ? "filter-tab is-active" : "filter-tab"}
          >
            Hora de voltar
          </Link>
        </nav>
      </div>
      <Link href="/clientes?novo=1" className="btn btn-primary">
        + Lead / cliente
      </Link>
    </header>
  );
}

async function CrmRetornoView({ freq }: { freq: string }) {
  const data = await listCrmFrequency({ filter: freq });

  const filters: { id: string; label: string }[] = [
    { id: "due", label: `Hora de voltar (${data.counts.due ?? 0})` },
    { id: "all", label: `Todos (${data.counts.all ?? 0})` },
    ...CRM_FREQUENCY.map((f) => ({
      id: f.value,
      label: `${f.label} (${data.counts[f.value] ?? 0})`,
    })),
  ];

  return (
    <div className="panel">
      <CrmHeader active="retorno" />

      <nav className="filter-tabs" aria-label="Ritmo de retorno">
        {filters.map((f) => (
          <Link
            key={f.id}
            href={`/crm?view=retorno&freq=${f.id}`}
            className={data.filter === f.id ? "filter-tab is-active" : "filter-tab"}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <p className="panel-empty">Ninguém nesta faixa de ritmo agora.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Ritmo</th>
                <th>Dias sem vir</th>
                <th>Intervalo médio</th>
                <th>Último serviço</th>
                <th>Última visita</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/clientes?id=${r.id}`}>{r.name}</Link>
                  </td>
                  <td>{r.phone ?? "—"}</td>
                  <td>
                    <span className={`crm-freq crm-freq--${r.frequency}`}>
                      {labelCrmFrequency(r.frequency)}
                    </span>
                    {r.dueForReturn ? (
                      <span className="muted"> · voltar</span>
                    ) : null}
                  </td>
                  <td>{r.daysSince ?? "—"}</td>
                  <td>{r.avgIntervalDays != null ? `${r.avgIntervalDays}d` : "—"}</td>
                  <td>{r.lastServiceName ?? "—"}</td>
                  <td>{r.lastAt ? formatDateTimeSp(r.lastAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
