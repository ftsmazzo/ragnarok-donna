"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
};

/** Painel lateral — portal no body para não ficar atrás da grade/sticky. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 420,
}: DrawerProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  /** Só fecha se o gesto começou no overlay (evita fechar ao selecionar texto e soltar fora). */
  const pointerDownOnOverlay = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    pointerDownOnOverlay.current = false;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Modal por cima do drawer — não fecha a comanda no Esc do modal
      if (document.body.dataset.uiModal === "1") return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      if (document.body.dataset.uiModal !== "1") {
        document.body.style.overflow = "";
      }
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="ui-overlay"
      role="presentation"
      onMouseDown={(e) => {
        pointerDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!pointerDownOnOverlay.current) return;
        pointerDownOnOverlay.current = false;
        onClose();
      }}
    >
      <aside
        className="ui-drawer"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="ui-drawer-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="ui-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="ui-drawer-body">{children}</div>
        {footer ? <footer className="ui-drawer-foot">{footer}</footer> : null}
      </aside>
    </div>,
    document.body
  );
}
