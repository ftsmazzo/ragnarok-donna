"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { ClientDrawer } from "@/components/clients/ClientDrawer";
import { formatDateTimeSp, formatTimeSp } from "@/lib/datetime";
import type { ConversationDetail } from "@/server/agent/conversations";
import type { ClientDetail, ClientProfile } from "@/server/clients/queries";
import {
  returnToAiAction,
  sendHumanMessageAction,
  takeHandoffAction,
} from "@/app/(painel)/conversas/actions";
import { getClientFichaAction } from "@/app/(painel)/clientes/actions";

type Props = {
  open: boolean;
  conversation: ConversationDetail | null;
  onClose: () => void;
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

export function ConversationDrawer({ open, conversation, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);

  const [fichaOpen, setFichaOpen] = useState(false);
  const [fichaClient, setFichaClient] = useState<ClientDetail | null>(null);
  const [fichaProfile, setFichaProfile] = useState<ClientProfile | null>(null);
  const [fichaLoading, setFichaLoading] = useState(false);

  useEffect(() => {
    setDraft("");
    setError(null);
    setFichaOpen(false);
    setFichaClient(null);
    setFichaProfile(null);
  }, [conversation?.id]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conversation?.messages.length, open]);

  if (!conversation) {
    return (
      <Drawer open={open} onClose={onClose} title="Conversa">
        <p className="panel-empty">Conversa não encontrada.</p>
      </Drawer>
    );
  }

  const conversationId = conversation.id;
  const clientId = conversation.clientId;
  const human = conversation.mode === "human";
  const title = conversation.clientName ?? conversation.phoneE164;
  const subtitle = [
    conversation.phoneE164,
    human ? "Modo humano" : `Modo IA${conversation.agentName ? ` · ${conversation.agentName}` : ""}`,
  ].join(" · ");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Falha");
    });
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    run(async () => {
      const result = await sendHumanMessageAction(conversationId, text);
      if (result.ok) setDraft("");
      return result;
    });
  }

  function openFicha() {
    if (!clientId) return;
    setError(null);
    setFichaLoading(true);
    startTransition(async () => {
      const result = await getClientFichaAction(clientId);
      setFichaLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFichaClient(result.client);
      setFichaProfile(result.profile);
      setFichaOpen(true);
    });
  }

  function closeFicha() {
    setFichaOpen(false);
  }

  function onFichaSaved(id: string) {
    startTransition(async () => {
      const result = await getClientFichaAction(id);
      if (result.ok) {
        setFichaClient(result.client);
        setFichaProfile(result.profile);
      }
    });
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        width={480}
        footer={
          human ? (
            <form className="chat-compose" onSubmit={onSend}>
              <textarea
                className="chat-input"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Responder ao cliente…"
                disabled={pending}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={pending || !draft.trim()}
              >
                Enviar
              </button>
              <p className="muted-note chat-compose-hint">
                Enviado pelo WhatsApp conectado quando o canal está ativo.
              </p>
            </form>
          ) : (
            <p className="muted-note">
              A IA responde automaticamente. Assuma o atendimento para falar com o cliente.
            </p>
          )
        }
      >
        <div className="chat-drawer-meta">
          <span className={`badge${human ? " is-warn" : " is-muted"}`}>
            {human ? "Humano" : "IA"}
          </span>
          {clientId ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || fichaLoading}
              onClick={openFicha}
            >
              {fichaLoading ? "Abrindo ficha…" : "Ficha do cliente"}
            </button>
          ) : null}
          {human ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={() => run(() => returnToAiAction(conversationId))}
            >
              Devolver à IA
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() => run(() => takeHandoffAction(conversationId))}
            >
              Assumir atendimento
            </button>
          )}
        </div>

        {conversation.assignedUserName && human ? (
          <p className="muted-note">Com: {conversation.assignedUserName}</p>
        ) : null}
        {conversation.humanRequestedAt && !conversation.humanTakenAt ? (
          <p className="muted-note">
            Pedido de humano em {formatDateTimeSp(new Date(conversation.humanRequestedAt))}
          </p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="chat-thread" ref={threadRef}>
          {conversation.messages.length === 0 ? (
            <p className="panel-empty">Sem mensagens ainda.</p>
          ) : (
            conversation.messages.map((m) => (
              <div
                key={m.id}
                className={`chat-bubble chat-bubble--${m.direction}`}
              >
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
      </Drawer>

      <ClientDrawer
        open={fichaOpen}
        mode="edit"
        client={fichaClient}
        profile={fichaProfile}
        onClose={closeFicha}
        onSaved={onFichaSaved}
      />
    </>
  );
}
