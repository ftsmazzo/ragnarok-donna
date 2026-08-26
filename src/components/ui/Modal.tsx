"use client";

import { useEffect, useId } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS = { sm: "ui-modal-sm", md: "ui-modal-md", lg: "ui-modal-lg" };

/** Diálogo central — confirmar, pagamento, encaixe (Sprint 3+) */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-overlay" onClick={onClose} role="presentation">
      <div
        className={`ui-modal ${SIZE_CLASS[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ui-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ui-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="ui-modal-body">{children}</div>
        {footer ? <footer className="ui-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
