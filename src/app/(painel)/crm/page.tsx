import Link from "next/link";
import { listCrmPipeline } from "@/server/crm/queries";
import { CRM_EXITS, CRM_STAGES, labelCrmStage, labelHowHeard } from "@/lib/crm";
import { formatDateTimeSp } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ stage?: string }>;
};

export default async function CrmPage({ searchParams }: Props) {
  const sp = await searchParams;
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
      <header className="panel-head">
        <div>
          <h1>CRM</h1>
          <p className="muted">
            Funil dentro do painel Ragnarok — origem, etapa e quem saiu. Frequência / “hora de
            voltar” na próxima entrega.
          </p>
        </div>
        <Link href="/clientes?novo=1" className="btn btn-primary">
          + Lead / cliente
        </Link>
      </header>

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
