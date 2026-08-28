"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 5000;

/** Atualiza inbox/chat enquanto a PWA está aberta (lista reflete handoff sem reentrar). */
export function usePwaInboxSync(enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    function refresh() {
      router.refresh();
    }

    refresh();
    const id = window.setInterval(refresh, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, router]);
}
