"use client";

import Link from "next/link";

type HandoffAlert = {
  id: string;
  phoneE164: string;
};

type Props = {
  alert: HandoffAlert | null;
  onDismiss: () => void;
};

/** Banner fixo quando cliente pede humano — visível mesmo com app aberto (celular suprime push). */
export function HandoffAlertOverlay({ alert, onDismiss }: Props) {
  if (!alert) return null;

  const href = `/pwa/conversas?filter=human&id=${alert.id}`;

  return (
    <div className="handoff-overlay" role="alert" aria-live="assertive">
      <div className="handoff-overlay-inner">
        <strong>Cliente pediu humano</strong>
        <p>{alert.phoneE164}</p>
        <div className="handoff-overlay-actions">
          <Link href={href} className="btn btn-primary btn-sm" onClick={onDismiss}>
            Abrir conversa
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
            Depois
          </button>
        </div>
      </div>
    </div>
  );
}
