"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS = { sm: "ui-modal-sm", md: "ui-modal-md", lg: "ui-modal-lg" };

/** Diálogo central — portal no body, z-index alto (acima de drawer). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  /** Evita fechar no mesmo gesto que abriu (mouseup no overlay). */
  const allowBackdropClose = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    allowBackdropClose.current = false;
    const t = window.setTimeout(() => {
      allowBackdropClose.current = true;
    }, 280);
    document.body.dataset.uiModal = "1";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      delete document.body.dataset.uiModal;
      if (!document.body.dataset.uiModal) {
        document.body.style.overflow = "";
      }
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="ui-overlay ui-overlay-modal"
      onClick={() => {
        if (allowBackdropClose.current) onClose();
      }}
      role="presentation"
    >
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
    </div>,
    document.body
  );
}
