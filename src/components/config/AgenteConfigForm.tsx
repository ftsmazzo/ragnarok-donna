"use client";

import { useState, useTransition } from "react";
import type { AgentConfigView } from "@/server/agent/agent-config";
import { saveAgentConfigAction } from "@/app/(painel)/configuracoes/agente/actions";

type Props = {
  initial: AgentConfigView;
};

const fieldStyle = { display: "block", marginTop: 12 } as const;
const gridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
} as const;

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
        essencia: String(fd.get("essencia") ?? ""),
        tomTraits: String(fd.get("tomTraits") ?? ""),
        regraDeOuro: String(fd.get("regraDeOuro") ?? ""),
        temaEmocional: String(fd.get("temaEmocional") ?? ""),
        expressoesTipicas: String(fd.get("expressoesTipicas") ?? ""),
        termosTecnicos: String(fd.get("termosTecnicos") ?? ""),
        termosProibidos: String(fd.get("termosProibidos") ?? ""),
        descaracteriza: String(fd.get("descaracteriza") ?? ""),
        historiaMarcaUsar: fd.get("historiaMarcaUsar") === "on",
        historiaMarcaEpisodios: String(fd.get("historiaMarcaEpisodios") ?? ""),
        perguntaRespostaUsar: fd.get("perguntaRespostaUsar") === "on",
        perguntaRespostaExemplo: String(fd.get("perguntaRespostaExemplo") ?? ""),
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
    <form
      className="relatorio-filters"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 20 }}
      onSubmit={onSubmit}
    >
      <p className="client-profile-hint">
        Estas opções valem <strong>só para esta unidade</strong>. Aqui você ajusta como a Donna
        fala — tom de voz, vocabulário e histórias da marca. Skills e tools do sistema são globais.
      </p>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-title" style={{ marginBottom: 8 }}>
          Identidade
        </legend>
        <div style={gridStyle}>
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
        <label className="filter-field" style={fieldStyle}>
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
          Tom de voz
        </legend>
        <p className="muted-note" style={{ marginBottom: 8 }}>
          Como no guia de persona: essência, traços de tom, regra de ouro e o que a agente nunca
          deve soar.
        </p>
        <label className="filter-field" style={fieldStyle}>
          <span>Essência da voz</span>
          <input
            name="essencia"
            className="search-input"
            defaultValue={initial.essencia}
            maxLength={280}
            placeholder="acolhimento com precisão e pontualidade"
          />
        </label>
        <label className="filter-field" style={fieldStyle}>
          <span>Traços de tom (separados por vírgula)</span>
          <input
            name="tomTraits"
            className="search-input"
            defaultValue={initial.tomTraits}
            placeholder="caloroso, direto, ágil, sem enrolação"
          />
        </label>
        <div style={gridStyle}>
          <label className="filter-field">
            <span>Regra de ouro</span>
            <input
              name="regraDeOuro"
              className="search-input"
              defaultValue={initial.regraDeOuro}
              maxLength={200}
              placeholder="Hora marcada é hora respeitada"
            />
          </label>
          <label className="filter-field">
            <span>Tema em momentos de atrito</span>
            <input
              name="temaEmocional"
              className="search-input"
              defaultValue={initial.temaEmocional}
              maxLength={280}
            />
          </label>
        </div>
        <label className="filter-field" style={fieldStyle}>
          <span>Expressões típicas (vírgula)</span>
          <input
            name="expressoesTipicas"
            className="search-input"
            defaultValue={initial.expressoesTipicas}
            placeholder="Perfeito, Combinado, Deixa comigo"
          />
        </label>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-title" style={{ marginBottom: 8 }}>
          Vocabulário
        </legend>
        <div style={gridStyle}>
          <label className="filter-field">
            <span>Termos preferidos (vírgula)</span>
            <input
              name="termosTecnicos"
              className="search-input"
              defaultValue={initial.termosTecnicos}
              placeholder="degradê, visagismo, combo, encaixe"
            />
          </label>
          <label className="filter-field">
            <span>Nunca use (vírgula)</span>
            <input
              name="termosProibidos"
              className="search-input"
              defaultValue={initial.termosProibidos}
              placeholder="bot, inteligência artificial, chatbot"
            />
          </label>
        </div>
        <label className="filter-field" style={fieldStyle}>
          <span>O que descaracteriza a agente (uma linha por item)</span>
          <textarea
            name="descaracteriza"
            className="search-input"
            defaultValue={initial.descaracteriza}
            rows={5}
            placeholder={"Inventar preço ou duração\nPrometer horário sem consultar a agenda"}
          />
        </label>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-title" style={{ marginBottom: 8 }}>
          História da marca
        </legend>
        <label className="filter-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            name="historiaMarcaUsar"
            defaultChecked={initial.historiaMarcaUsar}
          />
          <span>Usar episódios da marca no contexto (quando couber na conversa)</span>
        </label>
        <label className="filter-field" style={fieldStyle}>
          <span>Episódios (uma linha por história — como prova de caráter)</span>
          <textarea
            name="historiaMarcaEpisodios"
            className="search-input"
            defaultValue={initial.historiaMarcaEpisodios}
            rows={5}
            placeholder={"Desde 2019 elevando o cuidado masculino.\nAtendimento com horário marcado — sem fila."}
          />
        </label>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-title" style={{ marginBottom: 8 }}>
          Padrão de fala
        </legend>
        <label className="filter-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            name="perguntaRespostaUsar"
            defaultChecked={initial.perguntaRespostaUsar}
          />
          <span>Usar construção pergunta + resposta</span>
        </label>
        <label className="filter-field" style={fieldStyle}>
          <span>Exemplo de pergunta-resposta</span>
          <input
            name="perguntaRespostaExemplo"
            className="search-input"
            defaultValue={initial.perguntaRespostaExemplo}
            maxLength={200}
            placeholder="Quer agendar, saber endereço ou falar de produto?"
          />
        </label>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-title" style={{ marginBottom: 8 }}>
          Alerta ao pedir humano
        </legend>
        <p className="muted-note" style={{ marginBottom: 8 }}>
          Quando o cliente pedir especialista/humano, a Donna avisa este WhatsApp pela instância da
          unidade
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
