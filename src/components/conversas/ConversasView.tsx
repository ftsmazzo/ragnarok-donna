"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterTabs } from "@/components/cadastro/FilterTabs";
import { WhatsAppConnectPanel } from "@/components/conversas/WhatsAppConnectPanel";
import { ConversationDrawer } from "@/components/conversas/ConversationDrawer";
import { formatDateTimeSp } from "@/lib/datetime";
import type { WhatsAppConnectionView } from "@/server/agent/connection";
import type {
  ConversationDetail,
  ConversationFilter,
  ConversationListItem,
} from "@/server/agent/conversations";
import { clearAgentInboxAction, seedDemoConversationAction } from "@/app/(painel)/conversas/actions";

type ListData = {
  rows: ConversationListItem[];
  agentReady: boolean;
  connectionStatus: string | null;
  filter: ConversationFilter;
};

type Props = {
  tenantName: string;
  data: ListData;
  selected: ConversationDetail | null;
  toolCount: number;
  skillTitles: { name: string; title: string; description: string }[];
  whatsApp: WhatsAppConnectionView | null;
};

function filterHref(filter: ConversationFilter) {
  if (filter === "todas") return "/conversas";
  return `/conversas?filter=${filter}`;
}

export function ConversasView({
  tenantName,
  data,
  selected,
  toolCount,
  skillTitles,
  whatsApp,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [seedError, setSeedError] = useState<string | null>(null);

  function buildUrl(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function openConversation(id: string) {
    router.push(buildUrl({ id }));
  }

  function closeDrawer() {
    router.push(buildUrl({ id: undefined }));
  }

  function seedDemo() {
    setSeedError(null);
    startTransition(async () => {
      const result = await seedDemoConversationAction();
      if (!result.ok) {
        setSeedError(result.error);
        return;
      }
      router.push(buildUrl({ id: result.id, filter: undefined }));
      router.refresh();
    });
  }

  function clearInbox() {
    if (!window.confirm("Apagar todas as conversas e mensagens deste estabelecimento?")) {
      return;
    }
    setSeedError(null);
    startTransition(async () => {
      const result = await clearAgentInboxAction();
      if (!result.ok) {
        setSeedError(result.error);
        return;
      }
      router.push("/conversas");
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Conversas"
        subtitle={`${tenantName} · inbox IA ↔ humano`}
        actions={
          <div className="header-actions">
            <Link href="/relatorios/perfil?tab=retorno" className="btn btn-outline">
              Lista de retorno
            </Link>
            <button
              type="button"
              className="btn btn-outline"
              disabled={pending}
              onClick={clearInbox}
            >
              Limpar inbox
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={seedDemo}
            >
              {pending ? "Criando…" : "Conversa de teste"}
            </button>
          </div>
        }
      />

      <div className="dash-grid" style={{ marginBottom: 12 }}>
        <WhatsAppConnectPanel initial={whatsApp} />
        <section className="panel dash-panel">
          <div className="panel-toolbar">
            <strong>Agente Donna</strong>
            <span className="badge is-muted">
              {data.agentReady ? "Perfil OK" : "Sem perfil"}
            </span>
          </div>
          <div className="panel-body">
            <p className="muted-note">
              Perfil: <strong>{data.agentReady ? "Donna (default)" : "ausente"}</strong>
            </p>
            <p className="muted-note" style={{ marginTop: 8 }}>
              Envie uma mensagem para o número conectado — a Donna responde e o thread aparece
              na inbox.
            </p>
            {seedError ? <p className="form-error">{seedError}</p> : null}
          </div>
        </section>
        <section className="panel dash-panel">
          <div className="panel-toolbar">
            <strong>Skills / Tools v1</strong>
          </div>
          <div className="panel-body">
            <ul className="insight-tips">
              {skillTitles.map((s) => (
                <li key={s.name}>
                  <strong>{s.title}</strong> — {s.description}
                </li>
              ))}
            </ul>
            <p className="muted-note" style={{ marginTop: 8 }}>
              {toolCount} tools no catálogo.
            </p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-toolbar panel-toolbar-split">
          <strong>Inbox</strong>
          <FilterTabs
            tabs={[
              {
                label: "Todas",
                href: filterHref("todas"),
                active: data.filter === "todas",
              },
              {
                label: "IA",
                href: filterHref("ai"),
                active: data.filter === "ai",
              },
              {
                label: "Humano",
                href: filterHref("human"),
                active: data.filter === "human",
              },
            ]}
          />
          <span className="badge is-muted">{data.rows.length} conversa(s)</span>
        </div>
        <div className="table-wrap">
          <table className="data-table data-table-clickable">
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
                    Nenhuma conversa ainda. Conecte o WhatsApp acima ou use{" "}
                    <strong>Conversa de teste</strong>.
                  </td>
                </tr>
              ) : (
                data.rows.map((c) => (
                  <tr
                    key={c.id}
                    className={selected?.id === c.id ? "is-selected" : undefined}
                    onClick={() => openConversation(c.id)}
                  >
                    <td className="cell-strong">{c.phoneE164}</td>
                    <td>{c.clientName ?? "—"}</td>
                    <td>
                      <span className={`badge${c.mode === "human" ? " is-warn" : " is-muted"}`}>
                        {c.mode === "human" ? "Humano" : "IA"}
                      </span>
                    </td>
                    <td>
                      {c.lastMessageAt ? formatDateTimeSp(new Date(c.lastMessageAt)) : "—"}
                    </td>
                    <td className="chat-preview-cell">{c.preview ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConversationDrawer
        open={Boolean(selected)}
        conversation={selected}
        onClose={closeDrawer}
      />
    </>
  );
}
