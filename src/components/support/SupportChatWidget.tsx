"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { SUGGESTED_PROMPTS } from "@/content/support/suggestions";
import { isSupportNavHref, linkifySupportReply } from "@/lib/support-deeplinks";
import type { SupportMessageDto, SupportThreadDto } from "@/lib/support-types";
import { hasCapability } from "@/server/permissions/capabilities";
import type { MemberRole } from "@/server/types";
import {
  escalateSupportAction,
  loadSupportThreadAction,
  returnSupportToAiAction,
  sendSupportMessageAction,
} from "@/app/(painel)/support/actions";

type Props = {
  role: MemberRole;
  /** painel = canto esquerdo; pwa = canto adaptado mobile */
  variant?: "painel" | "pwa";
};

function roleLabel(role: SupportMessageDto["role"]) {
  if (role === "user") return "Você";
  if (role === "assistant") return "Suporte";
  if (role === "human_support") return "Fábrica";
  return "Sistema";
}

function isValidRoute(href: string): boolean {
  return isSupportNavHref(href);
}

function renderTextWithBareLinks(body: string, keyPrefix: string): ReactNode[] {
  const parts = body.split(/(\/[a-z][\w\-]*(?:\/[\w\-.?=&%]*)*)/gi);
  return parts.map((part, i) => {
    if (part.startsWith("/") && /^\/[a-z][\w\-]*(?:\/[\w\-.?=&%]*)*$/i.test(part) && isValidRoute(part)) {
      return (
        <Link key={`${keyPrefix}-${i}-${part}`} href={part} className="support-chat-deeplink">
          {part}
        </Link>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

/** Torna nomes de tela e rotas internas clicáveis no bubble. */
function renderBodyWithDeepLinks(body: string): ReactNode {
  const linked = linkifySupportReply(body);
  const chunks: ReactNode[] = [];
  const markdownLink = /\[([^\]\n]+)\]\((\/[a-z][\w\-]*(?:\/[\w\-.?=&%]*)*)\)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null = null;

  while ((match = markdownLink.exec(linked)) !== null) {
    if (match.index > cursor) {
      chunks.push(...renderTextWithBareLinks(linked.slice(cursor, match.index), `plain-${cursor}`));
    }
    const label = match[1].trim();
    const href = match[2];
    if (isValidRoute(href)) {
      chunks.push(
        <Link key={`md-${match.index}-${href}`} href={href} className="support-chat-deeplink">
          {label}
        </Link>
      );
    } else {
      chunks.push(<span key={`md-txt-${match.index}`}>{match[0]}</span>);
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < linked.length) {
    chunks.push(...renderTextWithBareLinks(linked.slice(cursor), `tail-${cursor}`));
  }

  if (chunks.length === 0) {
    if (linked.startsWith("/") && /^\/[a-z][\w\-]*(?:\/[\w\-.?=&%]*)*$/i.test(linked) && isValidRoute(linked)) {
      return (
        <Link href={linked} className="support-chat-deeplink">
          {linked}
        </Link>
      );
    }
    return <span>{linked}</span>;
  }

  return chunks;
}

/**
 * Chat flutuante estilo AppBarber — suporte do painel (≠ Donna WhatsApp).
 */
export function SupportChatWidget({ role, variant = "painel" }: Props) {
  const canUse = hasCapability(role, "support.use");
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<SupportThreadDto | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [booting, setBooting] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !canUse) return;
    let cancelled = false;
    setBooting(true);
    void loadSupportThreadAction().then((res) => {
      if (cancelled) return;
      setBooting(false);
      if (res.ok) setThread(res.thread);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canUse]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, open, pending]);

  if (!canUse) return null;

  function refreshOptimistic(next: Partial<SupportThreadDto> & { append?: SupportMessageDto[] }) {
    setThread((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...next,
        messages: next.append ? [...prev.messages, ...next.append] : prev.messages,
        status: (next.status as SupportThreadDto["status"]) ?? prev.status,
      };
    });
  }

  function send(text: string) {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    setDraft("");
    const optimistic: SupportMessageDto = {
      id: `local-${Date.now()}`,
      role: "user",
      body,
      createdAt: new Date().toISOString(),
    };
    refreshOptimistic({ append: [optimistic] });

    startTransition(async () => {
      const res = await sendSupportMessageAction(body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const reload = await loadSupportThreadAction();
      if (reload.ok) setThread(reload.thread);
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  function escalate() {
    setError(null);
    startTransition(async () => {
      const res = await escalateSupportAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const reload = await loadSupportThreadAction();
      if (reload.ok) setThread(reload.thread);
    });
  }

  function returnAi() {
    setError(null);
    startTransition(async () => {
      const res = await returnSupportToAiAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const reload = await loadSupportThreadAction();
      if (reload.ok) setThread(reload.thread);
    });
  }

  const status = thread?.status ?? "ai";
  const empty = !thread?.messages.length;

  return (
    <div
      className={[
        "support-chat",
        open ? "is-open" : "",
        variant === "pwa" ? "support-chat--pwa" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!open ? (
        <button
          type="button"
          className="support-chat-fab"
          onClick={() => setOpen(true)}
          aria-label="Abrir suporte"
        >
          <span className="support-chat-fab-icon" aria-hidden>
            ?
          </span>
          <span className="support-chat-fab-label">Suporte</span>
        </button>
      ) : (
        <div className="support-chat-panel" role="dialog" aria-label="Suporte do app">
          <header className="support-chat-head">
            <div>
              <strong>Central de ajuda</strong>
              <small>
                {status === "human" ? "Fila humana · Fábrica IA" : "Ajuda pra operar o app"}
              </small>
            </div>
            <button
              type="button"
              className="support-chat-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              ×
            </button>
          </header>

          {status === "human" ? (
            <div className="support-chat-banner">
              Pedido humano ativo — alguém da Fábrica foi notificado.
              <button type="button" onClick={returnAi} disabled={pending}>
                Voltar pra IA
              </button>
            </div>
          ) : null}

          <div className="support-chat-thread">
            {booting && empty ? (
              <p className="support-chat-empty">Abrindo conversa…</p>
            ) : empty ? (
              <div className="support-chat-welcome">
                <p>
                  Em que posso ajudar no sistema? Agenda, comanda, consumo, cadastros — só isso.
                </p>
                <div className="support-chat-suggestions">
                  {SUGGESTED_PROMPTS.map((q) => (
                    <button key={q} type="button" disabled={pending} onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              thread?.messages.map((m) => (
                <div
                  key={m.id}
                  className={`support-chat-bubble support-chat-bubble--${m.role}`}
                >
                  <span className="support-chat-bubble-meta">{roleLabel(m.role)}</span>
                  <p>
                    {m.role === "assistant" || m.role === "human_support"
                      ? renderBodyWithDeepLinks(m.body)
                      : m.body}
                  </p>
                </div>
              ))
            )}
            {pending ? (
              <div className="support-chat-bubble support-chat-bubble--assistant is-typing">
                <span className="support-chat-bubble-meta">Suporte</span>
                <p>…</p>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {error ? <p className="support-chat-error">{error}</p> : null}

          <form className="support-chat-compose" onSubmit={onSubmit}>
            <input
              className="support-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Como uso…?"
              disabled={pending}
              maxLength={4000}
              autoComplete="off"
            />
            <button type="submit" className="support-chat-send" disabled={pending || !draft.trim()}>
              Enviar
            </button>
          </form>

          <footer className="support-chat-foot">
            <button type="button" className="support-chat-human" onClick={escalate} disabled={pending}>
              Falar com humano
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
