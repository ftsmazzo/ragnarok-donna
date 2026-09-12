"use client";

import { useEffect, useState } from "react";
import { clockSp } from "@/lib/datetime";

export type AgendaNowClock = {
  date: string;
  hour: number;
  minute: number;
};

/** Atualiza a cada 30s — linha temporal da agenda. */
export function useAgendaNow(enabled: boolean): AgendaNowClock | null {
  const [now, setNow] = useState<AgendaNowClock | null>(null);

  useEffect(() => {
    if (!enabled) {
      setNow(null);
      return;
    }
    const tick = () => setNow(clockSp());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return now;
}
