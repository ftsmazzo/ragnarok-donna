"use client";

import { useEffect, useState, useTransition } from "react";
import type { WhatsAppConnectionView } from "@/server/agent/connection";
import {
  linkWhatsAppInstanceAction,
  refreshWhatsAppPairingAction,
  replaceWhatsAppInstanceAction,
  startWhatsAppPairingAction,
  updateWhatsAppProfileNameAction,
  updateWhatsAppProfilePictureAction,
} from "@/app/(painel)/configuracoes/agente/whatsapp-actions";
import { syncInboxFromEvolutionAction } from "@/app/(painel)/conversas/actions";
import { ConfigSectionCard } from "@/components/config/ConfigSectionCard";

type Props = {
  initial: WhatsAppConnectionView | null;
  /** conversas = painel inbox; agente = config do agente */
  variant?: "conversas" | "agente";
  showInboxSync?: boolean;
};

export function WhatsAppConnectPanel({
  initial,
  variant = "conversas",
  showInboxSync = variant === "conversas",
}: Props) {
  const [state, setState] = useState<WhatsAppConnectionView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);
  const [linkName, setLinkName] = useState(initial?.availableInstances[0] ?? "");
  const [replaceName, setReplaceName] = useState(
    initial?.suggestedInstanceName || initial?.instanceName || ""
  );
  const [showReplace, setShowReplace] = useState(false);
  const [pictureUrl, setPictureUrl] = useState("");
  const [profileName, setProfileName] = useState(
    initial?.profileName?.trim() || initial?.suggestedProfileName || ""
  );
  const [pending, startTransition] = useTransition();

  const connected = state?.status === "connected";
  const available = state?.availableInstances ?? [];
  const instanceStuck =
    Boolean(state?.instanceName) &&
    Boolean(state?.suggestedInstanceName) &&
    state!.instanceName !== state!.suggestedInstanceName;

  function apply(data: WhatsAppConnectionView) {
    setState(data);
    if (data.profileName?.trim()) setProfileName(data.profileName);
    if (data.suggestedInstanceName && !showReplace) {
      setReplaceName(data.suggestedInstanceName);
    }
  }

  function startPairing() {
    setError(null);
    setOkNote(null);
    startTransition(async () => {
      const result = await startWhatsAppPairingAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply(result.data);
      setOkNote("QR gerado — escaneie no celular.");
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
      apply(result.data);
    });
  }

  function linkExisting() {
    setError(null);
    setOkNote(null);
    const name = linkName.trim();
    if (!name) {
      setError("Escolha ou digite o nome da instância na Evolution");
      return;
    }
    startTransition(async () => {
      const result = await linkWhatsAppInstanceAction(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply(result.data);
      setOkNote(`Instância "${result.data.instanceName}" vinculada a esta unidade.`);
    });
  }

  function replaceInstance() {
    setError(null);
    setOkNote(null);
    const name = replaceName.trim();
    if (!name) {
      setError("Informe o novo nome técnico da instância");
      return;
    }
    if (
      !window.confirm(
        `Trocar a instância para "${name}"?\nA conexão atual (ex.: ${state?.instanceName ?? "—"}) será desligada e um QR novo será gerado. Evolution não renomeia — cria outra instância.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await replaceWhatsAppInstanceAction(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply(result.data);
      setShowReplace(false);
      setOkNote(
        `Instância agora é "${result.data.instanceName}". Escaneie o QR com o número da barbearia.`
      );
    });
  }

  function syncInbox() {
    setError(null);
    setOkNote(null);
    startTransition(async () => {
      const result = await syncInboxFromEvolutionAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOkNote(
        `Sincronizado: ${result.imported} mensagem(ns) nova(s) · ${result.skipped} ignorada(s).`
      );
    });
  }

  function savePicture() {
    setError(null);
    setOkNote(null);
    startTransition(async () => {
      const result = await updateWhatsAppProfilePictureAction(pictureUrl);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply(result.data);
      setPictureUrl("");
      setOkNote("Foto de perfil enviada ao WhatsApp.");
    });
  }

  function saveName() {
    setError(null);
    setOkNote(null);
    startTransition(async () => {
      const result = await updateWhatsAppProfileNameAction(profileName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply(result.data);
      setOkNote("Nome de perfil atualizado.");
    });
  }

  // Tempo quase real: status a cada 5s; QR a cada 4s enquanto conecta
  useEffect(() => {
    const ms = connected ? 5000 : state?.qrcodeBase64 || state?.status === "connecting" ? 4000 : 8000;
    const id = window.setInterval(() => {
      refreshWhatsAppPairingAction().then((result) => {
        if (result.ok) apply(result.data);
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [connected, state?.qrcodeBase64, state?.status]);

  const replaceBlock = (
    <div className="wa-link-existing" style={{ marginTop: 12 }}>
      <p className="muted-note">
        Nome técnico na Evolution (não é o nome que o cliente vê no Zap). Se ficou travado no
        antigo (ex.: pessoal), troque aqui — a Evolution não renomeia, cria outra e gera QR novo.
      </p>
      {!showReplace ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={pending}
          onClick={() => {
            setReplaceName(state?.suggestedInstanceName || state?.instanceName || "");
            setShowReplace(true);
          }}
        >
          {instanceStuck ? "Trocar instância (sair do nome antigo)" : "Trocar nome da instância"}
        </button>
      ) : (
        <div className="wa-link-row">
          <input
            className="search-input"
            value={replaceName}
            onChange={(e) => setReplaceName(e.target.value)}
            placeholder={state?.suggestedInstanceName || "ragnaroks"}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending || !replaceName.trim()}
            onClick={replaceInstance}
          >
            {pending ? "Trocando…" : "Confirmar e gerar QR"}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending}
            onClick={() => setShowReplace(false)}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );

  const body = (
    <>
      <p className="muted-note" style={{ marginTop: 0 }}>
        {connected ? (
          <>
            Número ativo: <strong>{state?.phoneE164 ?? "—"}</strong>
            {" · "}
            Instância: <code>{state?.instanceName}</code>
            {state?.profileName ? (
              <>
                {" · "}Nome WA: <strong>{state.profileName}</strong>
              </>
            ) : null}
          </>
        ) : (
          <>
            Ragnarok: vincule a instância que já existe na Evolution. Novas unidades (Donna):
            gere a instância e escaneie o QR. Status atualiza sozinho.
            {state?.instanceName ? (
              <>
                {" "}
                Vínculo atual: <code>{state.instanceName}</code>
                {instanceStuck ? " (diferente do sugerido — use Trocar instância abaixo)." : null}
              </>
            ) : null}
          </>
        )}
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {okNote ? <p className="muted-note">{okNote}</p> : null}

      {connected ? (
        <>
          <div className="wa-connect-profile">
            {state?.profilePicUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.profilePicUrl}
                alt="Foto do WhatsApp"
                className="wa-profile-pic"
              />
            ) : (
              <div className="wa-profile-pic is-empty" aria-hidden>
                WA
              </div>
            )}
            <div className="wa-connect-profile-fields">
              <label className="filter-field">
                <span>Nome no WhatsApp</span>
                <input
                  className="search-input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  maxLength={80}
                  placeholder={state?.suggestedProfileName || "Sara | Ragnarok"}
                />
              </label>
              <p className="muted-note" style={{ marginTop: -4 }}>
                É o nome que o cliente vê no Zap (ex.: <strong>Sara | Ragnarok</strong>). Só
                muda na Evolution/WhatsApp depois de clicar em salvar com a sessão{" "}
                <strong>conectada</strong>. Diferente do
                nome técnico da instância na Evolution.
              </p>
              <label className="filter-field">
                <span>Nova foto (URL pública)</span>
                <input
                  className="search-input"
                  value={pictureUrl}
                  onChange={(e) => setPictureUrl(e.target.value)}
                  placeholder="https://…/foto.jpg"
                />
              </label>
            </div>
          </div>
          <div className="wa-connect-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending || profileName.trim().length < 2}
              onClick={saveName}
            >
              Salvar nome
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending || !pictureUrl.trim()}
              onClick={savePicture}
            >
              Trocar foto
            </button>
            {showInboxSync ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={syncInbox}
              >
                {pending ? "Sincronizando…" : "Sincronizar inbox"}
              </button>
            ) : null}
            <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={refresh}>
              Atualizar status
            </button>
          </div>
          {replaceBlock}
        </>
      ) : (
        <>
          <div className="wa-connect-actions">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={startPairing}>
              {pending
                ? "Gerando…"
                : state?.instanceName
                  ? "Gerar / renovar QR"
                  : "Criar instância e conectar"}
            </button>
            {state?.qrcodeBase64 ? (
              <button type="button" className="btn btn-outline" disabled={pending} onClick={refresh}>
                Atualizar QR
              </button>
            ) : (
              <button type="button" className="btn btn-outline" disabled={pending} onClick={refresh}>
                Atualizar status
              </button>
            )}
          </div>

          {replaceBlock}

          {(available.length > 0 || variant === "agente") && (
            <div className="wa-link-existing">
              <p className="muted-note">
                Já tem instância na Evolution? Vincule sem recriar (caso Ragnarok).
              </p>
              <div className="wa-link-row">
                {available.length > 0 ? (
                  <select
                    className="search-input"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {available.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="search-input"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder={state?.suggestedInstanceName || "nome-da-instancia"}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pending || !linkName.trim()}
                  onClick={linkExisting}
                >
                  Vincular
                </button>
              </div>
            </div>
          )}

          {state?.qrcodeBase64 ? (
            <div className="wa-qrcode-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.qrcodeBase64} alt="QR Code WhatsApp" className="wa-qrcode" />
              <p className="muted-note">
                Celular → WhatsApp → Aparelhos conectados → Conectar aparelho
              </p>
            </div>
          ) : null}
        </>
      )}
    </>
  );

  if (variant === "agente") {
    return (
      <ConfigSectionCard
        title="WhatsApp da unidade"
        description="Conexão Evolution em tempo quase real — vincular, QR, foto e nome do número."
        icon="📱"
        accent="green"
      >
        <div className="wa-connect-status-row">
          <span className={`badge${connected ? " is-success" : " is-warn"}`}>
            {connected
              ? "Conectado"
              : state?.status === "connecting"
                ? "Aguardando QR"
                : "Desconectado"}
          </span>
          <span className="muted-note" style={{ margin: 0 }}>
            Instância sugerida: <code>{state?.suggestedInstanceName ?? "—"}</code>
          </span>
        </div>
        {body}
      </ConfigSectionCard>
    );
  }

  return (
    <section className="panel dash-panel wa-connect-panel">
      <div className="panel-toolbar">
        <strong>WhatsApp · Donna</strong>
        <span className={`badge${connected ? " is-success" : " is-warn"}`}>
          {connected ? "Conectado" : state?.status === "connecting" ? "Aguardando QR" : "Desconectado"}
        </span>
      </div>
      <div className="panel-body">{body}</div>
    </section>
  );
}
