"use client";

import { useEffect, useId } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
};

/** Painel lateral — ficha de cliente, comanda, etc. (Sprint 1+) */
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
      <aside
        className="ui-drawer"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
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
    </div>
  );
}
