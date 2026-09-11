"use client";

import { useEffect, useRef } from "react";

type ConfirmItem = {
  id: string;
  clientName: string;
  startsAt: string;
  confirmedAt: string | null;
};

/**
 * Quando a unidade liga "som na confirmação", vibra/beep se cliente confirmou no Zap.
 */
export function ConfirmationSoundWatcher({ enabled }: { enabled: boolean }) {
  const bootRef = useRef(true);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function poll() {
      try {
        const since = new Date(Date.now() - (bootRef.current ? 90_000 : 20_000)).toISOString();
        bootRef.current = false;
        const res = await fetch(`/api/ops/confirm-pulse?since=${encodeURIComponent(since)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          ok?: boolean;
          enabled?: boolean;
          items?: ConfirmItem[];
        };
        if (!json.enabled || !json.items?.length) return;

        for (const item of json.items) {
          if (seenRef.current.has(item.id)) continue;
          seenRef.current.add(item.id);
          try {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate([120, 60, 120]);
            }
          } catch {
            /* ignore */
          }
          try {
            const Ctx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctx) continue;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = 880;
            gain.gain.value = 0.04;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.18);
            void ctx.close();
          } catch {
            /* ignore autoplay */
          }
        }
      } catch {
        /* ignore */
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return null;
}
