"use client";

import { useEffect, useRef, useState } from "react";

/** Banner de instalação PWA — só no celular, sem forçar. */
export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setHidden(true);
      return;
    }
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    if (isIos) setIosHint(true);

    function onBip(e: Event) {
      e.preventDefault();
      const ev = e as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
      setDeferred({
        prompt: async () => {
          await ev.prompt();
          await ev.userChoice;
          setDeferred(null);
          setHidden(true);
        },
      });
    }
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (hidden || seen.current) return null;

  if (deferred) {
    return (
      <div className="pwa-install">
        <div>
          <strong>Instalar Donna</strong>
          <p>Atalho na tela inicial — só conversas e alertas.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            seen.current = true;
            void deferred.prompt();
          }}
        >
          Instalar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHidden(true)}>
          Agora não
        </button>
      </div>
    );
  }

  if (iosHint) {
    return (
      <div className="pwa-install">
        <div>
          <strong>Adicionar à tela de início</strong>
          <p>No Safari: Compartilhar → Adicionar à Tela de Início.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHidden(true)}>
          Entendi
        </button>
      </div>
    );
  }

  return null;
}
