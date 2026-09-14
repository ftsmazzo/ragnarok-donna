"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { AgendaAppointment, AgendaPermissions } from "@/server/agenda/types";
import {
  patchAppointmentMetaAction,
  payAndCloseFromAgendaAction,
  removeBlockAction,
  setAppointmentEncaixeAction,
  updateAppointmentStatusAction,
} from "@/app/(painel)/agenda/actions";
import { openOrderFromAppointmentAction } from "@/app/(painel)/comandas/actions";

export type AgendaCtxTarget =
  | {
      kind: "appointment";
      appointment: AgendaAppointment;
      x: number;
      y: number;
    }
  | {
      kind: "cell";
      staffId: string;
      hour: number;
      minute?: number;
      x: number;
      y: number;
    };

type Props = {
  target: AgendaCtxTarget | null;
  date: string;
  permissions: AgendaPermissions;
  onClose: () => void;
  onSaved: () => void;
  onOpenComanda: (orderId: string) => void;
  onOpenForm: (
    mode: "schedule" | "block" | "encaixe",
    staffId: string,
    hour: number,
    minute?: number
  ) => void;
  onOpenDetail: (a: AgendaAppointment) => void;
  onVenda: (a: AgendaAppointment) => void;
};

const PAY_METHODS: { value: string; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "pix_key", label: "PIX chave" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
  { value: "rede_link", label: "Link Rede" },
  { value: "infinity", label: "Infinity" },
];

function clampPos(x: number, y: number, w: number, h: number) {
  const pad = 8;
  const maxX = typeof window !== "undefined" ? window.innerWidth - w - pad : x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - h - pad : y;
  return {
    left: Math.max(pad, Math.min(x, maxX)),
    top: Math.max(pad, Math.min(y, maxY)),
  };
}

export function AgendaContextMenu({
  target,
  date,
  permissions,
  onClose,
  onSaved,
  onOpenComanda,
  onOpenForm,
  onOpenDetail,
  onVenda,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    setError("");
    setPayOpen(false);
    setTagOpen(false);
    setTagValue("");
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const el = ref.current;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 360;
    setPos(clampPos(target.x, target.y, w, h));
  }, [target, payOpen, tagOpen, error]);

  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [target, onClose]);

  if (!target) return null;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("");
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  if (target.kind === "cell") {
    return (
      <div ref={ref} className="agenda-ctx" style={pos} role="menu">
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={!permissions.canWrite || pending}
          onClick={() => {
            onOpenForm("schedule", target.staffId, target.hour, target.minute ?? 0);
            onClose();
          }}
        >
          <span className="agenda-ctx-ico" aria-hidden>
            ▢
          </span>
          Agendar
        </button>
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={!permissions.canWrite || pending}
          onClick={() => {
            onOpenForm("encaixe", target.staffId, target.hour, target.minute ?? 0);
            onClose();
          }}
        >
          <span className="agenda-ctx-ico" aria-hidden>
            ✂
          </span>
          Encaixe
        </button>
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={!permissions.canWrite || pending}
          onClick={() => {
            onOpenForm("block", target.staffId, target.hour, target.minute ?? 0);
            onClose();
          }}
        >
          <span className="agenda-ctx-ico" aria-hidden>
            ■
          </span>
          Bloquear
        </button>
      </div>
    );
  }

  const a = target.appointment;
  const isBlock = a.status === "blocked";
  const closed = a.status === "cancelled" || a.status === "completed" || a.status === "no_show";

  if (isBlock) {
    return (
      <div ref={ref} className="agenda-ctx" style={pos} role="menu">
        {error ? <div className="agenda-ctx-error">{error}</div> : null}
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={!permissions.canWrite || pending}
          onClick={() => run(() => removeBlockAction(a.id, date))}
        >
          <span className="agenda-ctx-ico" aria-hidden>
            ✕
          </span>
          Remover bloqueio
        </button>
        <button type="button" className="agenda-ctx-item" onClick={() => onOpenDetail(a)}>
          <span className="agenda-ctx-ico" aria-hidden>
            i
          </span>
          Detalhes
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="agenda-ctx" style={pos} role="menu">
      {error ? <div className="agenda-ctx-error">{error}</div> : null}

      {permissions.canOpenOrder && !closed ? (
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              if (a.orderId) {
                onOpenComanda(a.orderId);
                onClose();
                return;
              }
              const result = await openOrderFromAppointmentAction(
                a.id,
                a.clientId ?? undefined
              );
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onSaved();
              onOpenComanda(result.id);
              onClose();
            });
          }}
        >
          <span className="agenda-ctx-ico" aria-hidden>
            ▤
          </span>
          Abrir Comanda
        </button>
      ) : null}

      {permissions.canOpenOrder && a.orderId && !closed ? (
        <div className={`agenda-ctx-flyout${payOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="agenda-ctx-item has-sub"
            disabled={pending}
            onClick={() => setPayOpen((v) => !v)}
          >
            <span className="agenda-ctx-ico" aria-hidden>
              ✓
            </span>
            Finalizar Comanda
            <span className="agenda-ctx-chevron">›</span>
          </button>
          {payOpen ? (
            <div className="agenda-ctx-sub" role="menu">
              {PAY_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className="agenda-ctx-item"
                  disabled={pending}
                  onClick={() =>
                    run(() => payAndCloseFromAgendaAction(a.orderId!, m.value, date))
                  }
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                className="agenda-ctx-item"
                disabled={pending}
                onClick={() => {
                  onOpenComanda(a.orderId!);
                  onClose();
                }}
              >
                Abrir para pagar…
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {permissions.canCancel && !closed ? (
        <>
          <button
            type="button"
            className="agenda-ctx-item"
            disabled={pending}
            onClick={() => run(() => updateAppointmentStatusAction(a.id, "no_show", date))}
          >
            <span className="agenda-ctx-ico is-danger" aria-hidden>
              ✕
            </span>
            Ausente
          </button>
          <button
            type="button"
            className="agenda-ctx-item"
            disabled={pending}
            onClick={() => run(() => updateAppointmentStatusAction(a.id, "cancelled", date))}
          >
            <span className="agenda-ctx-ico is-danger" aria-hidden>
              ⌫
            </span>
            Cancelado
          </button>
        </>
      ) : null}

      {permissions.canUpdateStatus && !closed ? (
        a.status === "confirmed" ? (
          <button
            type="button"
            className="agenda-ctx-item"
            disabled={pending}
            onClick={() => run(() => updateAppointmentStatusAction(a.id, "scheduled", date))}
          >
            <span className="agenda-ctx-ico" aria-hidden>
              👎
            </span>
            Desconfirmar
          </button>
        ) : a.status === "scheduled" ? (
          <button
            type="button"
            className="agenda-ctx-item"
            disabled={pending}
            onClick={() => run(() => updateAppointmentStatusAction(a.id, "confirmed", date))}
          >
            <span className="agenda-ctx-ico is-ok" aria-hidden>
              ✓
            </span>
            Confirmar
          </button>
        ) : null
      ) : null}

      {permissions.canWrite && !closed ? (
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={pending}
          onClick={() =>
            run(() =>
              patchAppointmentMetaAction(a.id, date, {
                noPreference: !a.noPreference,
              })
            )
          }
        >
          <span className="agenda-ctx-ico" aria-hidden>
            ✋
          </span>
          {a.noPreference ? "Com preferência" : "Sem Preferência"}
        </button>
      ) : null}

      {permissions.canWrite && !closed ? (
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={pending}
          onClick={() =>
            run(() => setAppointmentEncaixeAction(a.id, !a.isEncaixe, date))
          }
        >
          <span className="agenda-ctx-ico" aria-hidden>
            ✂
          </span>
          {a.isEncaixe ? "Tirar encaixe" : "Encaixe"}
        </button>
      ) : null}

      {permissions.canOpenOrder && !closed ? (
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={pending}
          onClick={() => {
            onVenda(a);
            onClose();
          }}
        >
          <span className="agenda-ctx-ico" aria-hidden>
            🛒
          </span>
          Venda
        </button>
      ) : null}

      {permissions.canWrite && !closed ? (
        <div className={`agenda-ctx-flyout${tagOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="agenda-ctx-item has-sub"
            disabled={pending}
            onClick={() => setTagOpen((v) => !v)}
          >
            <span className="agenda-ctx-ico" aria-hidden>
              🏷
            </span>
            Adicionar Tag
            <span className="agenda-ctx-chevron">›</span>
          </button>
          {tagOpen ? (
            <div className="agenda-ctx-sub agenda-ctx-tag" role="menu">
              <input
                className="agenda-ctx-tag-input"
                value={tagValue}
                placeholder="Ex.: VIP, atrasado…"
                maxLength={40}
                autoFocus
                onChange={(e) => setTagValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const t = tagValue.trim();
                    if (!t) return;
                    run(() => patchAppointmentMetaAction(a.id, date, { addTag: t }));
                  }
                }}
              />
              <button
                type="button"
                className="agenda-ctx-item"
                disabled={pending || !tagValue.trim()}
                onClick={() => {
                  const t = tagValue.trim();
                  if (!t) return;
                  run(() => patchAppointmentMetaAction(a.id, date, { addTag: t }));
                }}
              >
                Salvar tag
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {permissions.canUpdateStatus && !closed && a.status !== "arrived" ? (
        <button
          type="button"
          className="agenda-ctx-item"
          disabled={pending}
          onClick={() => run(() => updateAppointmentStatusAction(a.id, "arrived", date))}
        >
          <span className="agenda-ctx-ico is-ok" aria-hidden>
            📍
          </span>
          No Local
        </button>
      ) : null}

      <div className="agenda-ctx-sep" />
      <button
        type="button"
        className="agenda-ctx-item"
        onClick={() => {
          onOpenDetail(a);
          onClose();
        }}
      >
        <span className="agenda-ctx-ico" aria-hidden>
          i
        </span>
        Abrir detalhes
      </button>
    </div>
  );
}
