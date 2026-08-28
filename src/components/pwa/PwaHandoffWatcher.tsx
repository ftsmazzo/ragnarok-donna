"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PulseItem = {
  id: string;
  phoneE164: string;
  humanRequestedAt: string | null;
};

const SEEN_KEY = "pwa-handoff-seen";
const POLL_MS = 5000;

function loadSeen(): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-80)));
  } catch {
    /* ignore */
  }
}

function itemKey(item: PulseItem): string {
  return `${item.id}:${item.humanRequestedAt ?? ""}`;
}

async function showHandoffNotification(item: PulseItem, brandName: string) {
  const title = `${brandName} — pediu humano`;
  const body = `${item.phoneE164} · toque para abrir`;
  const url = `/pwa/conversas?filter=human&id=${item.id}`;
  const options = {
    body,
    icon: "/branding/ragnarok-favicon.png",
    badge: "/branding/ragnarok-favicon.png",
    tag: `handoff-${item.id}`,
    data: { url },
    vibrate: [180, 90, 180],
  } as NotificationOptions & { renotify?: boolean; vibrate?: number[] };
  options.renotify = true;

  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  }

  navigator.vibrate?.([180, 90, 180]);
}

type Props = {
  brandName?: string;
};

/** Registra SW, pede permissão e avisa handoffs pendentes. */
export function PwaHandoffWatcher({ brandName = "Barbearia Ragnarok" }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const seen = useRef<Set<string>>(loadSeen());

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw-conversas.js", { scope: "/pwa/" })
      .then(() => setReady(true))
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
        if (!res.ok || cancelled) return;

        const json = (await res.json()) as { items?: PulseItem[] };
        const items = json.items ?? [];
        let fresh = false;

        for (const item of items) {
          const key = itemKey(item);
          if (seen.current.has(key)) continue;
          seen.current.add(key);
          fresh = true;
          await showHandoffNotification(item, brandName);
        }

        if (fresh) {
          saveSeen(seen.current);
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    }

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, brandName, router]);

  async function enable() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted" && "serviceWorker" in navigator) {
      await navigator.serviceWorker.ready;
    }
  }

  if (perm === "unsupported") return null;

  if (perm === "granted") {
    return (
      <div className="pwa-notify-bar pwa-notify-bar--ok">
        <span className="badge is-success">Alertas ativos</span>
        <span className="muted-note">Aviso quando cliente pedir humano (app aberto ou em segundo plano).</span>
      </div>
    );
  }

  return (
    <div className="pwa-notify-bar pwa-notify-bar--warn">
      <button type="button" className="btn btn-primary btn-sm" onClick={enable}>
        Ativar alertas
      </button>
      <span className="muted-note">
        Toque para permitir aviso sonoro/vibratório quando alguém pedir atendimento humano.
      </span>
    </div>
  );
}
