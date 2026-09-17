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
  const [reducedMotion, setReducedMotion] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => handleDialogKeyDown(event);
    const onFocusIn = (event: FocusEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        (inputRef.current?.disabled ? closeRef.current : inputRef.current)?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  useEffect(() => {
    if (open && pending && document.activeElement instanceof HTMLButtonElement) {
      if (document.activeElement.disabled) closeRef.current?.focus();
    }
    if (open && pending && document.activeElement === inputRef.current) {
      closeRef.current?.focus();
    }
  }, [open, pending]);

  useEffect(() => {
    if (!open || !canUse || pending) return;
    let cancelled = false;
    const loadVersion = requestVersionRef.current;
    setBooting(true);
    void loadSupportThreadAction().then((res) => {
      if (cancelled) return;
      setBooting(false);
      if (res.ok) {
        if (requestVersionRef.current === loadVersion) setThread(res.thread);
      } else {
        setError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, canUse, pending]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  }, [thread?.messages.length, open, pending, reducedMotion]);

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
    const requestId = crypto.randomUUID();
    requestVersionRef.current += 1;
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
      const res = await sendSupportMessageAction(body, requestId);
      if (!res.ok) {
        if (res.persisted) {
          const reload = await loadSupportThreadAction();
          if (reload.ok) setThread(reload.thread);
          setError(
            "A mensagem foi recebida, mas o suporte não conseguiu responder. Tente outra pergunta."
          );
        } else {
          setThread((prev) =>
            prev
              ? {
                  ...prev,
                  messages: prev.messages.filter((message) => message.id !== optimistic.id),
                }
              : prev
          );
          setDraft((current) => current || body);
          setError(res.error);
        }
        return;
      }
      const reload = await loadSupportThreadAction();
      if (reload.ok) {
        setThread(reload.thread);
      } else {
        refreshOptimistic({
          status: res.status,
          append: [
            {
              id: `local-reply-${Date.now()}`,
              role: "assistant",
              body: res.reply,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  function closeChat() {
    setOpen(false);
    requestAnimationFrame(() => fabRef.current?.focus());
  }

  function handleDialogKeyDown(
    e: Pick<KeyboardEvent, "key" | "preventDefault" | "shiftKey">
  ) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeChat();
      return;
    }
    if (e.key !== "Tab") return;

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) {
      e.preventDefault();
      panelRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
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
      if (reload.ok) {
        setThread(reload.thread);
      } else {
        refreshOptimistic({
          status: res.status,
          append: [
            {
              id: `local-handoff-${Date.now()}`,
              role: "assistant",
              body: res.reply,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
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
      if (reload.ok) {
        setThread(reload.thread);
      } else {
        refreshOptimistic({
          status: res.status,
          append: [
            {
              id: `local-ai-${Date.now()}`,
              role: "system",
              body: res.reply,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
    });
  }

  const status = thread?.status ?? "ai";
  const empty = !thread?.messages.length;
  const latestMessage = thread?.messages.at(-1);
  const liveStatus = booting
    ? "Abrindo conversa"
    : pending
      ? "Suporte está preparando uma resposta"
      : latestMessage && latestMessage.role !== "user"
        ? `${roleLabel(latestMessage.role)}: ${latestMessage.body}`
        : "";

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
          ref={fabRef}
          type="button"
          className="support-chat-fab"
          onClick={() => setOpen(true)}
          aria-label="Abrir suporte"
          aria-haspopup="dialog"
          aria-controls="support-chat-dialog"
        >
          <span className="support-chat-fab-icon" aria-hidden>
            ?
          </span>
          <span className="support-chat-fab-label">Suporte</span>
        </button>
      ) : (
        <>
        <div
          className="support-chat-backdrop"
          onMouseDown={closeChat}
          aria-hidden="true"
        />
        <div
          ref={panelRef}
          id="support-chat-dialog"
          className="support-chat-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-chat-title"
          aria-describedby="support-chat-description"
          tabIndex={-1}
        >
          <header className="support-chat-head">
            <div>
              <h2 id="support-chat-title">Central de ajuda</h2>
              <small id="support-chat-description">
                {status === "human"
                  ? "Atendimento externo notificado"
                  : "Ajuda pra operar o app"}
              </small>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="support-chat-close"
              onClick={closeChat}
              aria-label="Fechar Central de ajuda"
            >
              ×
            </button>
          </header>

          {status === "human" ? (
            <div className="support-chat-banner" role="status">
              A Fábrica foi notificada. O retorno acontece pelo canal externo da equipe.
              <button type="button" onClick={returnAi} disabled={pending}>
                Voltar pra IA
              </button>
            </div>
          ) : null}

          <div
            className="support-chat-thread"
            role="log"
            aria-label="Conversa de suporte"
            aria-live="off"
            aria-relevant="additions text"
            aria-busy={booting || pending}
          >
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
              <div
                className="support-chat-bubble support-chat-bubble--assistant is-typing"
              >
                <span className="support-chat-bubble-meta">Suporte</span>
                <p>Preparando resposta…</p>
              </div>
            ) : null}
            <div ref={endRef} aria-hidden />
          </div>

          <p className="support-chat-sr-only" role="status" aria-live="polite" aria-atomic="true">
            {liveStatus}
          </p>
          {error ? <p className="support-chat-error" role="alert">{error}</p> : null}

          <form className="support-chat-compose" onSubmit={onSubmit}>
            <label className="support-chat-sr-only" htmlFor="support-chat-message">
              Mensagem para o suporte
            </label>
            <input
              ref={inputRef}
              id="support-chat-message"
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
        </>
      )}
    </div>
  );
}
