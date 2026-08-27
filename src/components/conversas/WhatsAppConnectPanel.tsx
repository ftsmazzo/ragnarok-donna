"use client";

import { useEffect, useState, useTransition } from "react";
import type { WhatsAppConnectionView } from "@/server/agent/connection";
import {
  refreshWhatsAppPairingAction,
  startWhatsAppPairingAction,
  syncInboxFromEvolutionAction,
} from "@/app/(painel)/conversas/actions";

type Props = {
  initial: WhatsAppConnectionView | null;
};

export function WhatsAppConnectPanel({ initial }: Props) {
  const [state, setState] = useState<WhatsAppConnectionView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const connected = state?.status === "connected";

  function startPairing() {
    setError(null);
    setSyncNote(null);
    startTransition(async () => {
      const result = await startWhatsAppPairingAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.data);
    });
  }

  function refresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshWhatsAppPairingAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.data);
    });
  }

  function syncInbox() {
    setError(null);
    setSyncNote(null);
    startTransition(async () => {
      const result = await syncInboxFromEvolutionAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSyncNote(
        `Sincronizado: ${result.imported} mensagem(ns) nova(s) · ${result.skipped} ignorada(s).`
      );
    });
  }

  useEffect(() => {
    if (connected) return;
    if (!state?.qrcodeBase64 && state?.status !== "connecting") return;

    const id = window.setInterval(() => {
      refreshWhatsAppPairingAction().then((result) => {
        if (result.ok) setState(result.data);
      });
    }, 4000);

    return () => window.clearInterval(id);
  }, [connected, state?.qrcodeBase64, state?.status]);

  return (
    <section className="panel dash-panel wa-connect-panel">
      <div className="panel-toolbar">
        <strong>WhatsApp · Donna</strong>
        <span className={`badge${connected ? " is-success" : " is-warn"}`}>
          {connected ? "Conectado" : state?.status === "connecting" ? "Aguardando QR" : "Desconectado"}
        </span>
      </div>
      <div className="panel-body">
        {connected ? (
          <>
            <p className="muted-note">
              Número ativo: <strong>{state?.phoneE164 ?? "—"}</strong>
              {" · "}
              Instância: <code>{state?.instanceName}</code>
            </p>
            <p className="muted-note">
              Mensagens novas entram sozinhas. Se algo não apareceu, use{" "}
              <strong>Sincronizar inbox</strong>.
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            {syncNote ? <p className="muted-note">{syncNote}</p> : null}
            <div className="wa-connect-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={syncInbox}
              >
                {pending ? "Sincronizando…" : "Sincronizar inbox"}
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={refresh}>
                Atualizar status
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted-note">
              Use seu número <strong>provisório</strong> agora. No celular: WhatsApp → Aparelhos
              conectados → Conectar aparelho → escaneie o QR abaixo.
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="wa-connect-actions">
              <button type="button" className="btn btn-primary" disabled={pending} onClick={startPairing}>
                {pending ? "Gerando QR…" : "Conectar WhatsApp"}
              </button>
              {state?.qrcodeBase64 ? (
                <button type="button" className="btn btn-outline" disabled={pending} onClick={refresh}>
                  Atualizar QR
                </button>
              ) : null}
            </div>
            {state?.qrcodeBase64 ? (
              <div className="wa-qrcode-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={state.qrcodeBase64} alt="QR Code WhatsApp" className="wa-qrcode" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
