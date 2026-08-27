import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatDateTimeSp } from "@/lib/datetime";
import {
  ensureDefaultAgentProfile,
  listConversations,
  SKILL_CATALOG,
  TOOL_CATALOG,
} from "@/server/agent";
import { requireTenantContext } from "@/server/context/tenant";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  await requirePageAccess("/conversas");
  const tenant = await requireTenantContext();
  await ensureDefaultAgentProfile({ tenantId: tenant.id, displayName: "Donna" });
  const data = await listConversations();

  return (
    <>
      <PageHeader
        title="Conversas"
        subtitle={`${tenant.name} · orquestrador multi-tenant (Sprint 6.0)`}
        actions={
          <Link href="/relatorios/perfil?tab=retorno" className="btn btn-outline">
            Lista de retorno
          </Link>
        }
      />

      <div className="dash-grid" style={{ marginBottom: 12 }}>
        <section className="panel dash-panel">
          <div className="panel-toolbar">
            <strong>Canal WhatsApp</strong>
          </div>
          <div className="panel-body">
            <p className="muted-note">
              Status conexão:{" "}
              <strong>{data.connectionStatus ?? "não provisionada"}</strong>
              {" · "}
              Perfil agente:{" "}
              <strong>{data.agentReady ? "Donna (default)" : "ausente"}</strong>
            </p>
            <p className="muted-note" style={{ marginTop: 8 }}>
              Evolution + token de serviço entram na fase 6.2. Ver{" "}
              <code>docs/DONNA.md</code>.
            </p>
          </div>
        </section>
        <section className="panel dash-panel">
          <div className="panel-toolbar">
            <strong>Skills / Tools v1</strong>
          </div>
          <div className="panel-body">
            <ul className="insight-tips">
              {SKILL_CATALOG.map((s) => (
                <li key={s.name}>
                  <strong>{s.title}</strong> — {s.description}
                </li>
              ))}
            </ul>
            <p className="muted-note" style={{ marginTop: 8 }}>
              {TOOL_CATALOG.length} tools no catálogo (agenda → appointments, serviços →
              comandas).
            </p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-toolbar">
          <strong>Inbox</strong>
          <span className="badge is-muted">{data.rows.length} conversa(s)</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contato</th>
                <th>Cliente</th>
                <th>Modo</th>
                <th>Última msg</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Nenhuma conversa ainda. Quando o WhatsApp conectar, os threads aparecem
                    aqui — handoff IA ↔ humano no mesmo número.
                  </td>
                </tr>
              ) : (
                data.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.phoneE164}</td>
                    <td>
                      {c.clientId ? (
                        <Link href={`/clientes?id=${c.clientId}`}>{c.clientName}</Link>
                      ) : (
                        c.clientName ?? "—"
                      )}
                    </td>
                    <td>
                      <span className={`badge${c.mode === "human" ? " is-warn" : " is-muted"}`}>
                        {c.mode === "human" ? "Humano" : "IA"}
                      </span>
                    </td>
                    <td>{c.lastMessageAt ? formatDateTimeSp(c.lastMessageAt) : "—"}</td>
                    <td>{c.preview ?? "—"}</td>
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
