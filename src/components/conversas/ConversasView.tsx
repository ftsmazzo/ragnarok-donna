"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { FilterTabs } from "@/components/cadastro/FilterTabs";
import { WhatsAppConnectPanel } from "@/components/conversas/WhatsAppConnectPanel";
import { ConversationDrawer } from "@/components/conversas/ConversationDrawer";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatPhone } from "@/lib/format";
import type { WhatsAppConnectionView } from "@/server/agent/connection";
import type {
  ConversationDetail,
  ConversationFilter,
  ConversationListItem,
} from "@/server/agent/conversations";
import { clearAgentInboxAction } from "@/app/(painel)/conversas/actions";

type ListData = {
  rows: ConversationListItem[];
  agentReady: boolean;
  connectionStatus: string | null;
  filter: ConversationFilter;
  agentDisplayName?: string | null;
};

type Props = {
  tenantName: string;
  data: ListData;
  selected: ConversationDetail | null;
  toolCount: number;
  skillTitles: { name: string; title: string; description: string }[];
  whatsApp: WhatsAppConnectionView | null;
  compact?: boolean;
};

export function ConversasView({
  tenantName,
  data,
  selected,
  toolCount,
  skillTitles,
  whatsApp,
  compact = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const agentLabel = data.agentDisplayName?.trim() || "Agente da barbearia";
  const waOk = data.connectionStatus === "connected" || whatsApp?.status === "connected";

  // Inbox viva: atualiza lista e thread aberta sem F5 (pausa se aba oculta)
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    };
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [router]);

  function filterHref(filter: ConversationFilter) {
    if (filter === "todas") return pathname;
    return `${pathname}?filter=${filter}`;
  }

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

  function clearInbox() {
    if (!window.confirm("Apagar todas as conversas e mensagens deste estabelecimento?")) {
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await clearAgentInboxAction();
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.push(pathname);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title={compact ? "Inbox" : "Conversas"}
        subtitle={
          compact
            ? `${tenantName} · atendimento`
            : `${tenantName} · WhatsApp do cliente ↔ ${agentLabel}`
        }
        actions={
          compact ? (
            <Link href={`${pathname}?filter=human`} className="btn btn-primary btn-sm">
              Humanos
            </Link>
          ) : (
            <div className="header-actions">
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending}
                onClick={() => router.refresh()}
              >
                Atualizar
              </button>
              <Link href="/pwa/conversas" className="btn btn-outline">
                App celular
              </Link>
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
            </div>
          )
        }
      />

      {!compact ? (
        <div className="dash-grid conversas-intel-grid" style={{ marginBottom: 12 }}>
          <WhatsAppConnectPanel initial={whatsApp} />
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Agente da barbearia</strong>
              <span className={`badge${data.agentReady ? " is-success" : " is-warn"}`}>
                {data.agentReady ? "Pronto" : "Sem perfil"}
              </span>
            </div>
            <div className="panel-body">
              <p className="muted-note" style={{ marginTop: 0 }}>
                Nome no Zap: <strong>{agentLabel}</strong>
                {" · "}
                Canal:{" "}
                <strong>{waOk ? "conectado" : "desconectado"}</strong>
              </p>
              <p className="muted-note" style={{ marginTop: 8 }}>
                Mensagens no número da unidade entram aqui. Com canal conectado e perfil ativo, o
                agente responde sozinho; a equipe assume quando o cliente pede humano.
              </p>
              <div className="wa-connect-actions" style={{ marginTop: 10 }}>
                <Link href="/configuracoes/agente" className="btn btn-outline btn-sm">
                  Personalidade e WhatsApp
                </Link>
              </div>
              {actionError ? <p className="form-error">{actionError}</p> : null}
            </div>
          </section>
          <section className="panel dash-panel">
            <div className="panel-toolbar">
              <strong>Inteligência operacional</strong>
              <span className="badge is-muted">{toolCount} tools</span>
            </div>
            <div className="panel-body">
              <p className="muted-note" style={{ marginTop: 0, marginBottom: 8 }}>
                O que o agente sabe fazer nesta unidade — agenda, cliente, espera e handoff.
              </p>
              <ul className="insight-tips">
                {skillTitles.slice(0, 6).map((s) => (
                  <li key={s.name}>
                    <strong>{s.title}</strong> — {s.description}
                  </li>
                ))}
              </ul>
              {skillTitles.length > 6 ? (
                <p className="muted-note" style={{ marginTop: 8 }}>
                  +{skillTitles.length - 6} skills no catálogo.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <WhatsAppConnectPanel initial={whatsApp} />
          {actionError ? <p className="form-error">{actionError}</p> : null}
        </div>
      )}

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
                    Nenhuma conversa ainda. Conecte o WhatsApp e envie uma mensagem para o número
                    da unidade.
                  </td>
                </tr>
              ) : (
                data.rows.map((c) => (
                  <tr
                    key={c.id}
                    className={selected?.id === c.id ? "is-selected" : undefined}
                    onClick={() => openConversation(c.id)}
                  >
                    <td className="cell-strong">{formatPhone(c.phoneE164)}</td>
                    <td>{c.clientName ?? "—"}</td>
                    <td>
                      <span className={`badge${c.mode === "human" ? " is-warn" : " is-muted"}`}>
                        {c.mode === "human" ? "Humano" : "IA"}
                      </span>
                      {c.humanRequestedAt && !c.humanTakenAt ? (
                        <span className="badge is-warn" style={{ marginLeft: 6 }}>
                          Pediu humano
                        </span>
                      ) : null}
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
