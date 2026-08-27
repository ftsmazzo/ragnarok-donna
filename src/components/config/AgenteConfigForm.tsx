"use client";

import { useState, useTransition } from "react";
import type { AgentConfigView } from "@/server/agent/agent-config";
import { saveAgentConfigAction } from "@/app/(painel)/configuracoes/agente/actions";

type Props = {
  initial: AgentConfigView;
};

export function AgenteConfigForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const result = await saveAgentConfigAction({
        displayName: String(fd.get("displayName") ?? ""),
        businessName: String(fd.get("businessName") ?? ""),
        greeting: String(fd.get("greeting") ?? ""),
        handoffNotifyPhone: String(fd.get("handoffNotifyPhone") ?? ""),
      });
      if (result.ok) {
        setMsg("Configuração salva neste tenant.");
      } else {
        setErr(result.error);
      }
    });
  }

  return (
    <form className="relatorio-filters" style={{ flexDirection: "column", alignItems: "stretch", gap: 16 }} onSubmit={onSubmit}>
      <p className="client-profile-hint">
        Estas opções valem <strong>só para esta unidade</strong>. Skills e tools do sistema
        são as mesmas para todos os tenants; o que muda aqui é nome, saudação e alerta de
        humano.
      </p>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-title" style={{ marginBottom: 8 }}>
          Identidade da agente
        </legend>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label className="filter-field">
            <span>Nome da agente</span>
            <input
              name="displayName"
              className="search-input"
              defaultValue={initial.displayName}
              required
              maxLength={80}
              placeholder="Donna"
            />
          </label>
          <label className="filter-field">
            <span>Nome do negócio (como ela fala)</span>
            <input
              name="businessName"
              className="search-input"
              defaultValue={initial.businessName}
              required
              maxLength={120}
            />
          </label>
        </div>
        <label className="filter-field" style={{ marginTop: 12, display: "block" }}>
          <span>Saudação padrão</span>
          <input
            name="greeting"
            className="search-input"
            defaultValue={initial.greeting}
            maxLength={240}
            placeholder="Olá! Aqui é a Donna, recepção da Barbearia…"
          />
        </label>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-title" style={{ marginBottom: 8 }}>
          Alerta ao pedir humano
        </legend>
        <p className="muted-note" style={{ marginBottom: 8 }}>
          Quando o cliente pedir especialista/humano, a Donna avisa este WhatsApp pela
          instância da unidade
          {initial.whatsappConnected
            ? ` (conectada: ${initial.whatsappInstance})`
            : " (WhatsApp ainda desconectado)"}.
        </p>
        <label className="filter-field" style={{ display: "block", maxWidth: 320 }}>
          <span>Celular da equipe (DDD + número)</span>
          <input
            name="handoffNotifyPhone"
            className="search-input"
            defaultValue={initial.handoffNotifyPhone}
            placeholder="(17) 99999-9999"
            inputMode="tel"
          />
        </label>
      </fieldset>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {msg ? <span className="badge">{msg}</span> : null}
        {err ? <span className="badge is-warn">{err}</span> : null}
      </div>
    </form>
  );
}
