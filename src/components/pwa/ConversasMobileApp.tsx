"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTimeSp, formatTimeSp } from "@/lib/datetime";
import type { ConversationDetail, ConversationListItem } from "@/server/agent/conversations";
import {
  returnToAiAction,
  sendHumanMessageAction,
  takeHandoffAction,
} from "@/app/(painel)/conversas/actions";
import { PwaHandoffWatcher } from "./PwaHandoffWatcher";
import { PwaInstallBanner } from "./PwaInstallBanner";
import { HandoffAlertOverlay } from "./HandoffAlertOverlay";
import { usePwaInboxSync } from "./usePwaInboxSync";
import { handoffItemKey, saveNotified, type HandoffPulseItem, vibrateHandoff, wasNotified } from "@/lib/pwa-handoff";

type Props = {
  rows: ConversationListItem[];
  filter: "todas" | "ai" | "human";
  selected: ConversationDetail | null;
  brandName: string;
  basePath?: string;
};

function directionLabel(dir: ConversationDetail["messages"][number]["direction"]) {
  switch (dir) {
    case "inbound":
      return "Cliente";
    case "outbound_ai":
      return "IA";
    case "outbound_human":
      return "Você";
    case "system":
      return "Sistema";
  }
}

function needsAttention(row: ConversationListItem): boolean {
  return row.mode === "human" && Boolean(row.humanRequestedAt) && !row.humanTakenAt;
}

/** Inbox + chat em tela cheia — pensado para celular. */
export function ConversasMobileApp({
  rows,
  filter,
  selected,
  brandName,
  basePath = "/pwa/conversas",
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [handoffAlert, setHandoffAlert] = useState<{ id: string; phoneE164: string } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  usePwaInboxSync(true);

  useEffect(() => {
    const pendingRow = rows.find(needsAttention);
    if (!pendingRow?.humanRequestedAt) return;
    const key = handoffItemKey({
      id: pendingRow.id,
      phoneE164: pendingRow.phoneE164,
      humanRequestedAt: pendingRow.humanRequestedAt.toISOString(),
    });
    if (wasNotified(key)) return;
    setHandoffAlert({ id: pendingRow.id, phoneE164: pendingRow.phoneE164 });
    vibrateHandoff();
    saveNotified(key);
  }, [rows]);

  function onHandoffPulse(item: HandoffPulseItem) {
    setHandoffAlert({ id: item.id, phoneE164: item.phoneE164 });
  }

  const inChat = Boolean(selected);

  useEffect(() => {
    setDraft("");
    setError(null);
  }, [selected?.id]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [selected?.messages.length, inChat]);

  function goList(nextFilter?: string) {
    const f = nextFilter ?? filter;
    const qs = f === "todas" ? "" : `?filter=${f}`;
    router.push(`${basePath}${qs}`);
  }

  function openChat(id: string) {
    const qs = new URLSearchParams();
    if (filter !== "todas") qs.set("filter", filter);
    qs.set("id", id);
    router.push(`${basePath}?${qs.toString()}`);
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Falha");
      else router.refresh();
    });
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const text = draft.trim();
    if (!text) return;
    run(async () => {
      const result = await sendHumanMessageAction(selected.id, text);
      if (result.ok) setDraft("");
      return result;
    });
  }

  const shell = (
    <>
      {!inChat ? (
        <>
          <header className="minbox-head">
            <div>
              <strong>{brandName}</strong>
              <p>Conversas WhatsApp</p>
            </div>
            <Link href="/inicio?painel=1" className="minbox-panel-link">
              Painel
            </Link>
          </header>
          <PwaInstallBanner brandName={brandName} />
        </>
      ) : null}
      <PwaHandoffWatcher brandName={brandName} onHandoff={onHandoffPulse} />
      <HandoffAlertOverlay alert={handoffAlert} onDismiss={() => setHandoffAlert(null)} />
    </>
  );

  if (inChat && selected) {
    const human = selected.mode === "human";
    const title = selected.clientName ?? selected.phoneE164;
    const awaiting =
      human && Boolean(selected.humanRequestedAt) && !selected.humanTakenAt;

    return (
      <div className="mchat">
        {shell}
        <header className="mchat-head">
          <button type="button" className="mchat-back" onClick={() => goList()} aria-label="Voltar">
            ←
          </button>
          <div className="mchat-head-text">
            <strong>{title}</strong>
            <small>
              {selected.phoneE164} · {awaiting ? "Aguardando você" : human ? "Humano" : "IA"}
            </small>
          </div>
          {human ? (
            <button
              type="button"
              className="btn btn-outline btn-sm mchat-action"
              disabled={pending}
              onClick={() => run(() => returnToAiAction(selected.id))}
            >
              Devolver IA
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm mchat-action"
              disabled={pending}
              onClick={() => run(() => takeHandoffAction(selected.id))}
            >
              Assumir
            </button>
          )}
        </header>

        <div className="mchat-thread" ref={threadRef}>
          {error ? <p className="form-error">{error}</p> : null}
          {awaiting ? (
            <p className="mchat-handoff-banner">Cliente pediu atendimento humano — toque em Assumir.</p>
          ) : null}
          {selected.messages.length === 0 ? (
            <p className="panel-empty">Sem mensagens.</p>
          ) : (
            selected.messages.map((m) => (
              <div key={m.id} className={`chat-bubble chat-bubble--${m.direction}`}>
                <div className="chat-bubble-meta">
                  <span>
                    {m.direction === "outbound_human" && m.operatorName
                      ? m.operatorName
                      : directionLabel(m.direction)}
                  </span>
                  <time dateTime={new Date(m.createdAt).toISOString()}>
                    {formatTimeSp(new Date(m.createdAt))}
                  </time>
                </div>
                <p>{m.body}</p>
              </div>
            ))
          )}
        </div>

        <footer className="mchat-foot">
          {human ? (
            <form className="mchat-compose" onSubmit={onSend}>
              <textarea
                className="mchat-input"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Mensagem…"
                disabled={pending}
                enterKeyHint="send"
              />
              <button
                type="submit"
                className="btn btn-primary mchat-send"
                disabled={pending || !draft.trim()}
              >
                Enviar
              </button>
            </form>
          ) : (
            <p className="mchat-ai-note">A IA está respondendo. Toque em Assumir para falar.</p>
          )}
        </footer>
      </div>
    );
  }

  return (
    <div className="minbox">
      {shell}

      <div className="minbox-filters" role="tablist">
        {(
          [
            ["todas", "Todas"],
            ["ai", "IA"],
            ["human", "Humanos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`minbox-tab${filter === key ? " is-on" : ""}`}
            onClick={() => goList(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="minbox-list">
        {rows.length === 0 ? (
          <li className="minbox-empty">Nenhuma conversa neste filtro.</li>
        ) : (
          rows.map((r) => {
            const urgent = needsAttention(r);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={`minbox-item${urgent ? " is-urgent" : ""}`}
                  onClick={() => openChat(r.id)}
                >
                  <span className="minbox-item-top">
                    <strong>{r.clientName ?? r.phoneE164}</strong>
                    <span
                      className={`badge${urgent ? " is-warn" : r.mode === "human" ? " is-muted" : " is-muted"}`}
                    >
                      {urgent ? "Pediu humano" : r.mode === "human" ? "Humano" : "IA"}
                    </span>
                  </span>
                  <span className="minbox-item-preview">{r.preview ?? "—"}</span>
                  <span className="minbox-item-time">
                    {r.lastMessageAt ? formatDateTimeSp(new Date(r.lastMessageAt)) : "—"}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
