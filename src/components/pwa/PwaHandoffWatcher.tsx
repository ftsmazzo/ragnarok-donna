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
    return () => window.clearInterval(id);
  }, [ready]);

  async function enable() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPerm(p);
  }

  if (perm === "unsupported") return null;
  if (perm === "granted") return null;

  return (
    <div className="pwa-notify-bar">
      <button type="button" className="btn btn-primary btn-sm" onClick={enable}>
        Ativar alertas
      </button>
      <span className="muted-note">Avisa quando o cliente pedir atendimento humano.</span>
    </div>
  );
}
