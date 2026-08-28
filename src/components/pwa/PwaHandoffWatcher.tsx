"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ensurePushSubscription } from "@/lib/pwa-push-subscribe";
import {
  alertHandoff,
  POLL_MS,
  pushTestNotification,
  type HandoffPulseItem,
  vibrateHandoff,
} from "@/lib/pwa-handoff";

type Props = {
  brandName?: string;
  onHandoff?: (item: HandoffPulseItem) => void;
};

/** Sonda handoffs novos e dispara alerta (banner + push). */
export function PwaHandoffWatcher({ brandName = "Barbearia Ragnarok", onHandoff }: Props) {
  const router = useRouter();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const onHandoffRef = useRef(onHandoff);
  const lastPollRef = useRef<string | null>(null);
  const bootRef = useRef(true);
  onHandoffRef.current = onHandoff;

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw-conversas.js", { scope: "/pwa/" }).then((reg) => {
        void reg.update();
      });
    }
    if (!("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
    if (Notification.permission === "granted") {
      void ensurePushSubscription();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    function sinceParam(): string {
      if (bootRef.current) {
        bootRef.current = false;
        // Primeira sonda: pega handoffs dos últimos 2 min (app acabou de abrir)
        return new Date(Date.now() - 2 * 60_000).toISOString();
      }
      return lastPollRef.current ?? new Date(Date.now() - POLL_MS * 2).toISOString();
    }

    async function tick() {
      const since = sinceParam();
      lastPollRef.current = new Date().toISOString();

      try {
        const res = await fetch(
          `/api/agent/handoff-pulse?since=${encodeURIComponent(since)}`,
          { cache: "no-store", credentials: "include" }
        );
        if (!res.ok || cancelled) return;

        const json = (await res.json()) as { items?: HandoffPulseItem[] };
        let any = false;
        for (const item of json.items ?? []) {
          any = true;
          await alertHandoff(item, brandName, (i) => onHandoffRef.current?.(i));
        }
        if (any) router.refresh();
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
  }, [brandName, router]);

  async function enable() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      await ensurePushSubscription();
    }
  }

  async function testAlert() {
    vibrateHandoff();
    const ok = await pushTestNotification(brandName);
    if (!ok) {
      onHandoffRef.current?.({
        id: "test",
        phoneE164: "Teste manual",
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
        <span className="muted-note">Push ativo — avisa mesmo com app fechado (iOS 16.4+).</span>
      </div>
    );
  }

  return (
    <div className="pwa-notify-bar pwa-notify-bar--warn">
      <button type="button" className="btn btn-primary btn-sm" onClick={enable}>
        Ativar alertas
      </button>
      <span className="muted-note">Permita notificações para aviso de handoff.</span>
    </div>
  );
}