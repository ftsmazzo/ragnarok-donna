"use client";

import Link from "next/link";
import { dismissHandoff, handoffItemKey, type HandoffPulseItem } from "@/lib/pwa-handoff";

type Props = {
  alert: HandoffPulseItem | null;
  onDismiss: () => void;
};

/** Banner fixo — handoff real (celular suprime push com app aberto). */
export function HandoffAlertOverlay({ alert, onDismiss }: Props) {
  if (!alert) return null;

  const href = `/pwa/conversas?filter=human&id=${alert.id}`;

  function dismiss() {
    if (!alert) return;
    dismissHandoff(handoffItemKey(alert));
    onDismiss();
  }

  return (
    <div className="handoff-overlay" role="alert" aria-live="assertive">
      <div className="handoff-overlay-inner">
        <strong>Cliente pediu humano</strong>
        <p>{alert.phoneE164}</p>
        <div className="handoff-overlay-actions">
          <Link href={href} className="btn btn-primary btn-sm" onClick={dismiss}>
            Abrir conversa
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
            Depois
          </button>
        </div>
      </div>
    </div>
  );
}
