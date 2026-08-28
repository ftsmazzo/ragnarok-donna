"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  handoffItemKey,
  POLL_MS,
  pushHandoffNotification,
  pushTestNotification,
  saveNotified,
  type HandoffPulseItem,
  vibrateHandoff,
  wasNotified,
} from "@/lib/pwa-handoff";

type Props = {
  brandName?: string;
  onHandoff?: (item: HandoffPulseItem) => void;
};

/** Registra SW, pede permissão e avisa handoffs pendentes. */
export function PwaHandoffWatcher({ brandName = "Barbearia Ragnarok", onHandoff }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const onHandoffRef = useRef(onHandoff);
  onHandoffRef.current = onHandoff;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw-conversas.js", { scope: "/pwa/" })
      .then(async (reg) => {
        setReady(true);
        await reg.update().catch(() => undefined);
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

    async function handleItem(item: HandoffPulseItem) {
      const key = handoffItemKey(item);
      if (wasNotified(key)) return;

      vibrateHandoff();
      onHandoffRef.current?.(item);

      const pushed = await pushHandoffNotification(item, brandName);
      saveNotified(key);
      router.refresh();

      if (!pushed && !cancelled) {
        onHandoffRef.current?.(item);
      }
    }

    async function tick() {
      try {
        const res = await fetch("/api/agent/handoff-pulse", { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const json = (await res.json()) as { items?: HandoffPulseItem[] };
        for (const item of json.items ?? []) {
          await handleItem(item);
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

  async function testAlert() {
    vibrateHandoff();
    const ok = await pushTestNotification(brandName);
    if (!ok) {
      onHandoffRef.current?.({
        id: "test",
        phoneE164: "Teste de alerta",
        humanRequestedAt: new Date().toISOString(),
      });
    }
  }

  if (perm === "unsupported") return null;

  if (perm === "granted") {
    return (
      <div className="pwa-notify-bar pwa-notify-bar--ok">
        <span className="badge is-success">Alertas ativos</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={testAlert}>
          Testar alerta
        </button>
        <span className="muted-note">Com o app aberto, o banner laranja também aparece.</span>
      </div>
    );
  }

  return (
    <div className="pwa-notify-bar pwa-notify-bar--warn">
      <button type="button" className="btn btn-primary btn-sm" onClick={enable}>
        Ativar alertas
      </button>
      <span className="muted-note">
        Permita notificações para aviso quando alguém pedir atendimento humano.
      </span>
    </div>
  );
}
