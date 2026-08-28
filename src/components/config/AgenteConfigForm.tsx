"use client";

import { useState, useTransition } from "react";
import type { AgentConfigView } from "@/server/agent/agent-config";
import { saveAgentConfigAction } from "@/app/(painel)/configuracoes/agente/actions";
import { ConfigSectionCard } from "@/components/config/ConfigSectionCard";
import { Toggle } from "@/components/ui/Toggle";

type Props = {
  initial: AgentConfigView;
};

export function AgenteConfigForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [historiaMarcaUsar, setHistoriaMarcaUsar] = useState(initial.historiaMarcaUsar);
  const [perguntaRespostaUsar, setPerguntaRespostaUsar] = useState(initial.perguntaRespostaUsar);

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
        historiaMarcaUsar,
        historiaMarcaEpisodios: String(fd.get("historiaMarcaEpisodios") ?? ""),
        perguntaRespostaUsar,
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
    <form className="agent-config-form" onSubmit={onSubmit}>
      <div className="agent-config-intro">
        <strong>Orientação, não roteiro.</strong> Estes campos definem <em>como</em> a Donna fala
        — tom, vocabulário e limites. A IA varia as frases a cada conversa; nada aqui vira texto
        fixo repetido. Skills e tools do sistema são globais; o resto é só desta unidade.
      </div>

      <ConfigSectionCard
        title="Identidade"
        description="Nome da agente, do negócio e primeira impressão no WhatsApp."
        icon="👤"
        accent="orange"
      >
        <div className="config-grid">
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
          <label className="filter-field config-span-2">
            <span>Saudação padrão</span>
            <input
              name="greeting"
              className="search-input"
              defaultValue={initial.greeting}
              maxLength={240}
              placeholder="Olá! Aqui é a Donna, recepção da Barbearia…"
            />
          </label>
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="Tom de voz"
        description="Essência, traços e regras emocionais — o “jeito” de falar, não frases prontas."
        icon="🎙️"
        accent="blue"
      >
        <label className="filter-field">
          <span>Essência da voz</span>
          <input
            name="essencia"
            className="search-input"
            defaultValue={initial.essencia}
            maxLength={280}
            placeholder="acolhimento com precisão e pontualidade"
          />
        </label>
        <label className="filter-field">
          <span>Traços de tom (separados por vírgula)</span>
          <input
            name="tomTraits"
            className="search-input"
            defaultValue={initial.tomTraits}
            placeholder="caloroso, direto, ágil, sem enrolação"
          />
        </label>
        <div className="config-grid">
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
        <label className="filter-field">
          <span>Expressões típicas (vírgula — usar com moderação)</span>
          <input
            name="expressoesTipicas"
            className="search-input"
            defaultValue={initial.expressoesTipicas}
            placeholder="Perfeito, Combinado, Deixa comigo"
          />
        </label>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="Vocabulário"
        description="Palavras que reforçam a marca e termos que a agente nunca deve usar."
        icon="📚"
        accent="slate"
      >
        <div className="config-grid">
          <label className="filter-field">
            <span>Termos preferidos</span>
            <input
              name="termosTecnicos"
              className="search-input"
              defaultValue={initial.termosTecnicos}
              placeholder="degradê, visagismo, combo, encaixe"
            />
          </label>
          <label className="filter-field">
            <span>Nunca use</span>
            <input
              name="termosProibidos"
              className="search-input"
              defaultValue={initial.termosProibidos}
              placeholder="bot, inteligência artificial, chatbot"
            />
          </label>
        </div>
        <label className="filter-field">
          <span>O que descaracteriza a agente (uma linha por item)</span>
          <textarea
            name="descaracteriza"
            className="search-input"
            defaultValue={initial.descaracteriza}
            rows={5}
            placeholder={"Inventar preço ou duração\nPrometer horário sem consultar a agenda"}
          />
        </label>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="História da marca"
        description="Episódios que humanizam a conversa — só quando couber no contexto."
        icon="📖"
        accent="green"
      >
        <Toggle
          id="historiaMarcaUsar"
          name="historiaMarcaUsar"
          checked={historiaMarcaUsar}
          onChange={setHistoriaMarcaUsar}
          label="Usar histórias da marca"
          hint="Ligado: a Donna pode citar episódios quando fizer sentido. Desligado: foco só no atendimento."
        />
        <label className={`filter-field${historiaMarcaUsar ? "" : " is-collapsed"}`}>
          <span>Episódios (uma linha por história)</span>
          <textarea
            name="historiaMarcaEpisodios"
            className="search-input"
            defaultValue={initial.historiaMarcaEpisodios}
            rows={5}
            disabled={!historiaMarcaUsar}
            placeholder={"Desde 2019 elevando o cuidado masculino.\nAtendimento com horário marcado — sem fila."}
          />
        </label>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="Padrão de fala"
        description="Construções que ajudam a soar natural — sem repetir o mesmo exemplo toda hora."
        icon="💬"
        accent="blue"
      >
        <Toggle
          id="perguntaRespostaUsar"
          name="perguntaRespostaUsar"
          checked={perguntaRespostaUsar}
          onChange={setPerguntaRespostaUsar}
          label="Pergunta + resposta"
          hint="Ex.: “Quer agendar ou saber o endereço?” — a IA adapta, não copia literal."
        />
        <label className={`filter-field${perguntaRespostaUsar ? "" : " is-collapsed"}`}>
          <span>Exemplo de referência (não é texto fixo)</span>
          <input
            name="perguntaRespostaExemplo"
            className="search-input"
            defaultValue={initial.perguntaRespostaExemplo}
            maxLength={200}
            disabled={!perguntaRespostaUsar}
            placeholder="Quer agendar, saber endereço ou falar de produto?"
          />
        </label>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="Alerta ao pedir humano"
        description="Quando o cliente pedir especialista, avisamos a equipe neste número."
        icon="🔔"
        accent="orange"
      >
        <p className="muted-note" style={{ margin: 0 }}>
          Instância WhatsApp da unidade:{" "}
          {initial.whatsappConnected ? (
            <strong>{initial.whatsappInstance}</strong>
          ) : (
            <span className="badge is-warn">desconectada</span>
          )}
        </p>
        <label className="filter-field" style={{ maxWidth: 320 }}>
          <span>Celular da equipe (DDD + número)</span>
          <input
            name="handoffNotifyPhone"
            className="search-input"
            defaultValue={initial.handoffNotifyPhone}
            placeholder="(17) 99999-9999"
            inputMode="tel"
          />
        </label>
      </ConfigSectionCard>

      <div className="agent-config-footer">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar configuração"}
        </button>
        {msg ? <span className="badge">{msg}</span> : null}
        {err ? <span className="badge is-warn">{err}</span> : null}
      </div>
    </form>
  );
}
