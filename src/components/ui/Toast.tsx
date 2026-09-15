"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
  entering: boolean;
};

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let globalShowToast: ((message: string, kind?: ToastKind) => void) | null = null;

/** Fora de React (ex.: callbacks) — preferir useToast() dentro de componentes. */
export function showToast(message: string, kind: ToastKind = "info") {
  globalShowToast?.(message, kind);
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (message: string, kind?: ToastKind) => showToast(message, kind),
    };
  }
  return ctx;
}

const AUTO_DISMISS_MS = 4200;

export function ToastHost({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idPrefix = useId();

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const showToastFn = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, kind, entering: false }]);
      requestAnimationFrame(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, entering: true } : t))
        );
      });
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss, idPrefix]
  );

  useEffect(() => {
    globalShowToast = showToastFn;
    return () => {
      if (globalShowToast === showToastFn) globalShowToast = null;
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, [showToastFn]);

  return (
    <ToastContext.Provider value={{ showToast: showToastFn }}>
      {children}
      <div className="toast-host" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}${t.entering ? " is-in" : ""}`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
