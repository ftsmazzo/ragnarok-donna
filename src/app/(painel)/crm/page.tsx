import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { CrmKanban } from "@/components/crm/CrmKanban";
import { getCrmDashboard } from "@/server/crm/dashboard";
import { listCrmPipeline } from "@/server/crm/queries";
import { listCrmFrequency } from "@/server/crm/frequency";
import { listSubscriptions } from "@/server/subscriptions/mutations";
import { labelSubscriptionStatus } from "@/lib/subscriptions";
import { CRM_EXITS, CRM_STAGES, labelCrmStage, labelCrmStatus, labelHowHeard } from "@/lib/crm";
import { CRM_FREQUENCY, labelCrmFrequency } from "@/lib/crm-frequency";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type View = "inicio" | "funil" | "retorno" | "assinaturas" | "lista";

type Props = {
  searchParams: Promise<{
    view?: string;
    stage?: string;
    freq?: string;
    status?: string;
  }>;
};

function parseView(raw?: string): View {
  if (raw === "funil" || raw === "retorno" || raw === "assinaturas" || raw === "lista") {
    return raw;
  }
  return "inicio";
}

export default async function CrmPage({ searchParams }: Props) {
  await requirePageAccess("/crm");
  const sp = await searchParams;
  const view = parseView(sp.view);

  return (
    <div className="crm-page">
      <PageHeader
        title="CRM"
        subtitle="Leads, funil e retorno — operação da barbearia"
        actions={
          <Link href="/clientes?novo=1" className="btn btn-primary">
            + Lead / cliente
          </Link>
        }
      />

      <nav className="crm-nav" aria-label="Seções do CRM">
        {(
          [
            { id: "inicio", href: "/crm", label: "Início" },
            { id: "funil", href: "/crm?view=funil", label: "Funil" },
            { id: "retorno", href: "/crm?view=retorno", label: "Hora de voltar" },
            { id: "assinaturas", href: "/crm?view=assinaturas", label: "Assinaturas" },
            { id: "lista", href: "/crm?view=lista", label: "Lista" },
          ] as const
        ).map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={view === item.id ? "crm-nav-item is-active" : "crm-nav-item"}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {view === "inicio" ? <CrmInicio /> : null}
      {view === "funil" ? <CrmFunilView /> : null}
      {view === "retorno" ? <CrmRetornoView freq={sp.freq?.trim() || "due"} /> : null}
      {view === "assinaturas" ? (
        <CrmAssinaturasView status={sp.status?.trim() || "all"} />
      ) : null}
      {view === "lista" ? <CrmListaView stage={sp.stage?.trim() || "all"} /> : null}
    </div>
  );
}

async function CrmInicio() {
  let dash;
  try {
    dash = await getCrmDashboard();
  } catch (err) {
    console.error("[CrmInicio]", err);
    return (
      <p className="panel-empty">
        Não foi possível carregar o painel do CRM agora. Tente de novo em instantes.
      </p>
    );
  }
  const maxStage = Math.max(1, ...dash.stageCounts.map((s) => s.count));

  return (
    <>
      <SummaryCards
        cards={[
          {
            label: "No funil",
            value: dash.funnelInProgress,
            hint: "Com etapa definida",
          },
          {
            label: "Leads",
            value: dash.leads,
            hint: "Status lead",
          },
          {
            label: "Novos na semana",
            value: dash.newThisWeek,
            hint: "Cadastros últimos 7 dias",
          },
          {
            label: "Hora de voltar",
            value: dash.dueReturns,
            hint: "Ritmo / risco / inativo",
          },
          {
            label: "Assinaturas",
            value: dash.activeSubscriptions,
            hint:
              dash.lateSubscriptions > 0
                ? `${dash.lateSubscriptions} atrasada(s)`
                : "Em dia",
          },
        ]}
      />

      <div className="crm-dash-grid">
        <section className="panel crm-dash-panel">
          <div className="panel-toolbar">
            <strong>Funil por etapa</strong>
            <Link href="/crm?view=funil" className="btn btn-outline btn-sm">
              Abrir Kanban
            </Link>
          </div>
          <div className="panel-body">
            {dash.stageCounts.every((s) => s.count === 0) ? (
              <p className="panel-empty">
                Ninguém no funil ainda. Cadastre origem na ficha ou arraste no Kanban.
              </p>
            ) : (
              <ul className="crm-funnel-bars">
                {dash.stageCounts.map((s) => (
                  <li key={s.stage}>
                    <div className="crm-funnel-bar-label">
                      <span>{s.label}</span>
                      <strong>{s.count}</strong>
                    </div>
                    <div className="crm-funnel-bar-track">
                      <div
                        className="crm-funnel-bar-fill"
                        style={{
                          transform: `scaleX(${s.count / maxStage})`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel crm-dash-panel">
          <div className="panel-toolbar">
            <strong>Novos na semana</strong>
            <Link href="/clientes?novo=1" className="btn btn-ghost btn-sm">
              + Lead
            </Link>
          </div>
          <div className="panel-body">
            {dash.newThisWeekRows.length === 0 ? (
              <p className="panel-empty">Nenhum cadastro novo nos últimos 7 dias.</p>
            ) : (
              <ul className="crm-dash-list">
                {dash.newThisWeekRows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/clientes?id=${r.id}`}>{r.name}</Link>
                    <span className="muted">
                      {labelHowHeard(r.howHeard)}
                      {r.crmStage ? ` · ${labelCrmStage(r.crmStage)}` : ""}
                      {" · "}
                      {formatDateTimeSp(r.createdAt).slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel crm-dash-panel">
          <div className="panel-toolbar">
            <strong>Hora de voltar</strong>
            <Link href="/crm?view=retorno" className="btn btn-outline btn-sm">
              Ver todos
            </Link>
          </div>
          <div className="panel-body">
            {dash.dueSample.length === 0 ? (
              <p className="panel-empty">Ninguém na janela de retorno agora.</p>
            ) : (
              <ul className="crm-dash-list">
                {dash.dueSample.map((r) => (
                  <li key={r.id}>
                    <Link href={`/clientes?id=${r.id}`}>{r.name}</Link>
                    <span className="muted">
                      {r.daysSince ?? "?"}d · {r.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

async function CrmFunilView() {
  const data = await listCrmPipeline({ funnelOnly: true, limit: 400 });
  return (
    <div className="panel">
      <div className="panel-toolbar">
        <div>
          <strong>Kanban do funil</strong>
          <p className="muted-note" style={{ margin: "4px 0 0" }}>
            Arraste entre colunas · {data.counts.all ?? 0} no funil
            {data.counts.exited ? ` · ${data.counts.exited} saídas` : ""}
          </p>
        </div>
        <Link href="/crm?view=lista" className="btn btn-outline btn-sm">
          Ver lista
        </Link>
      </div>
      <div className="panel-body" style={{ paddingTop: 0 }}>
        <CrmKanban rows={data.rows} counts={data.counts} />
      </div>
    </div>
  );
}

async function CrmListaView({ stage }: { stage: string }) {
  const data = await listCrmPipeline({ stage, funnelOnly: true, limit: 200 });
  const filters: { id: string; label: string }[] = [
    { id: "all", label: `No funil (${data.counts.all ?? 0})` },
    { id: "unstaged", label: `Sem etapa (${data.counts.unstaged ?? 0})` },
    ...CRM_STAGES.map((s) => ({
      id: s.value,
      label: `${s.label} (${data.counts[s.value] ?? 0})`,
    })),
    { id: "exited", label: `Saídas (${data.counts.exited ?? 0})` },
  ];

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <strong>Lista do funil</strong>
      </div>
      <nav className="filter-tabs" aria-label="Filtrar etapa" style={{ padding: "0 12px 10px" }}>
        {filters.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/crm?view=lista" : `/crm?view=lista&stage=${f.id}`}
            className={stage === f.id ? "filter-tab is-active" : "filter-tab"}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {data.rows.length === 0 ? (
        <p className="panel-empty">Ninguém nesta etapa.</p>
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
                  <td>{labelCrmStatus(r.crmStatus)}</td>
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
      <div className="panel-toolbar">
        <strong>Ritmo de retorno</strong>
      </div>
      <nav className="filter-tabs" aria-label="Ritmo" style={{ padding: "0 12px 10px" }}>
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
        <p className="panel-empty">Ninguém nesta faixa.</p>
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

async function CrmAssinaturasView({ status }: { status: string }) {
  const rows = await listSubscriptions({ status });
  const filters = [
    { id: "all", label: "Todas" },
    { id: "active", label: "Ativas" },
    { id: "late", label: "Atrasadas" },
    { id: "cancelled", label: "Canceladas" },
  ];

  return (
    <div className="panel">
      <div className="panel-toolbar">
        <strong>Assinaturas mensais</strong>
      </div>
      <nav className="filter-tabs" aria-label="Status" style={{ padding: "0 12px 10px" }}>
        {filters.map((f) => (
          <Link
            key={f.id}
            href={`/crm?view=assinaturas&status=${f.id}`}
            className={status === f.id ? "filter-tab is-active" : "filter-tab"}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="panel-empty">
          Nenhuma assinatura. Crie na ficha do cliente → aba Assinatura.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Período até</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/clientes?id=${r.clientId}`}>{r.clientName}</Link>
                  </td>
                  <td>{r.name}</td>
                  <td>{formatMoney(r.priceCents)}</td>
                  <td>{labelSubscriptionStatus(r.status)}</td>
                  <td>{formatDateTimeSp(r.currentPeriodEnd).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
