"use client";

import { useEffect, useRef, useState } from "react";

type PulseItem = {
  id: string;
  phoneE164: string;
  humanRequestedAt: string | null;
};

/** Registra SW + pede notificação + sonda handoffs pendentes. */
export function PwaHandoffWatcher() {
  const [ready, setReady] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const seen = useRef<Set<string>>(new Set());
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw-conversas.js", { scope: "/pwa/" })
      .then((reg) => {
        swRef.current = reg;
        setReady(true);
      })
      .catch(() => setReady(false));

    if (!("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/agent/handoff-pulse", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: PulseItem[] };
        const items = json.items ?? [];
        for (const item of items) {
          if (seen.current.has(item.id)) continue;
          seen.current.add(item.id);
          const title = "Cliente pediu humano";
          const body = `${item.phoneE164} — abra Conversas`;
          const url = `/pwa/conversas?filter=human&id=${item.id}`;
          if (swRef.current?.active) {
            swRef.current.active.postMessage({
              type: "handoff-notify",
              title,
              body,
              url,
              tag: `handoff-${item.id}`,
            });
          } else if (Notification.permission === "granted") {
            new Notification(title, { body, tag: `handoff-${item.id}` });
          }
        }
      } catch {
        /* ignore */
      }
    }

    tick();
    const id = window.setInterval(tick, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      void cancelled;
    };
  }, [ready]);

  async function enable() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPerm(p);
  }

  if (perm === "unsupported") return null;

  return (
    <div className="pwa-notify-bar">
      {perm !== "granted" ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={enable}>
          Ativar alertas no celular
        </button>
      ) : (
        <span className="badge is-success">Alertas ativos</span>
      )}
      <span className="muted-note">
        {ready ? "App pronto para instalar (menu do navegador → Adicionar à tela inicial)" : "Preparando PWA…"}
      </span>
    </div>
  );
}
