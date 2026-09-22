"use client";

import { useMemo, useState, useTransition } from "react";
import { saveOutreachSettingsAction } from "@/app/(painel)/configuracoes/disparos/actions";
import { ConfigSectionCard } from "@/components/config/ConfigSectionCard";
import { Toggle } from "@/components/ui/Toggle";
import type { OutreachSettingsView } from "@/server/outreach/defaults";
import { DEFAULT_OUTREACH_VARIANT_POOLS } from "@/server/outreach/defaults";
import {
  normalizeTemplatePool,
  pickVariantTemplate,
  renderOutreachTemplate,
} from "@/server/outreach/templates";

type Props = { initial: OutreachSettingsView };

function boolFromFd(fd: FormData, name: string, fallback: boolean) {
  const v = fd.get(name);
  if (v == null) return fallback;
  return String(v) === "true";
}

export function DisparosConfigForm({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showMoreMessages, setShowMoreMessages] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [confirmationEnabled, setConfirmationEnabled] = useState(initial.confirmationEnabled);
  const [followup30Enabled, setFollowup30Enabled] = useState(initial.followup30Enabled);
  const [followup60Enabled, setFollowup60Enabled] = useState(initial.followup60Enabled);
  const [sundayBlastEnabled, setSundayBlastEnabled] = useState(initial.sundayBlastEnabled);
  const [emptyAgendaEnabled, setEmptyAgendaEnabled] = useState(initial.emptyAgendaEnabled);
  const [soundOnConfirmEnabled, setSoundOnConfirmEnabled] = useState(
    initial.soundOnConfirmEnabled
  );
  const [birthdayEnabled, setBirthdayEnabled] = useState(initial.birthdayEnabled);
  const [skipSundays, setSkipSundays] = useState(initial.skipSundays);
  const [skipHolidays, setSkipHolidays] = useState(initial.skipHolidays);
  const [dryRunEnabled, setDryRunEnabled] = useState(initial.dryRunEnabled);

  const [tplConfirm, setTplConfirm] = useState(initial.templateConfirmation);
  const [tplConfirmVariants, setTplConfirmVariants] = useState(
    initial.templateConfirmationVariants.join("\n")
  );
  const [tplBirthday, setTplBirthday] = useState(initial.templateBirthday);

  const confirmPool = useMemo(
    () =>
      normalizeTemplatePool(
        tplConfirm,
        tplConfirmVariants.split("\n"),
        DEFAULT_OUTREACH_VARIANT_POOLS.confirmation
      ),
    [tplConfirm, tplConfirmVariants]
  );

  const previewA = useMemo(() => {
    const p = pickVariantTemplate({
      pool: confirmPool,
      phoneE164: "+5511999990001",
      dayKey: "confirm:demo",
      kind: "confirmation_daily",
    });
    return renderOutreachTemplate(p.template, {
      nome: "Carlos",
      data: "12/09",
      hora: "15:00",
      profissional: "Luciano",
      barbearia: "Donna",
    });
  }, [confirmPool]);

  const previewB = useMemo(() => {
    const p = pickVariantTemplate({
      pool: confirmPool,
      phoneE164: "+5511988880002",
      dayKey: "confirm:demo",
      kind: "confirmation_daily",
    });
    return renderOutreachTemplate(p.template, {
      nome: "Ana",
      data: "12/09",
      hora: "16:30",
      profissional: "Diogo",
      barbearia: "Donna",
    });
  }, [confirmPool]);

  const birthdayPreview = useMemo(
    () =>
      renderOutreachTemplate(tplBirthday, {
        nome: "Carlos",
        barbearia: "Donna",
        desconto: initial.birthdayDiscountPct,
        data: "17/09",
      }),
    [tplBirthday, initial.birthdayDiscountPct]
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const result = await saveOutreachSettingsAction({
        confirmationEnabled: boolFromFd(fd, "confirmationEnabled", confirmationEnabled),
        followup30Enabled: boolFromFd(fd, "followup30Enabled", followup30Enabled),
        followup60Enabled: boolFromFd(fd, "followup60Enabled", followup60Enabled),
        sundayBlastEnabled: boolFromFd(fd, "sundayBlastEnabled", sundayBlastEnabled),
        emptyAgendaEnabled: boolFromFd(fd, "emptyAgendaEnabled", emptyAgendaEnabled),
        soundOnConfirmEnabled: boolFromFd(fd, "soundOnConfirmEnabled", soundOnConfirmEnabled),
        birthdayEnabled: boolFromFd(fd, "birthdayEnabled", birthdayEnabled),
        dryRunEnabled: boolFromFd(fd, "dryRunEnabled", dryRunEnabled),
        birthdayDiscountPct: Number(fd.get("birthdayDiscountPct") ?? 10),
        dailyCap: Number(fd.get("dailyCap") ?? 100),
        skipSundays: boolFromFd(fd, "skipSundays", skipSundays),
        skipHolidays: boolFromFd(fd, "skipHolidays", skipHolidays),
        confirmationSendTime: String(fd.get("confirmationSendTime") ?? "18:00"),
        followupMonthDaysText: String(fd.get("followupMonthDaysText") ?? ""),
        customClosedDatesText: String(fd.get("customClosedDatesText") ?? ""),
        followup30Days: Number(fd.get("followup30Days") ?? 30),
        followup60Days: Number(fd.get("followup60Days") ?? 60),
        blastActiveWithinDays: Number(fd.get("blastActiveWithinDays") ?? 120),
        templateConfirmation: String(fd.get("templateConfirmation") ?? ""),
        templateFollowup30: String(fd.get("templateFollowup30") ?? ""),
        templateFollowup60: String(fd.get("templateFollowup60") ?? ""),
        templateSundayBlast: String(fd.get("templateSundayBlast") ?? ""),
        templateEmptyAgenda: String(fd.get("templateEmptyAgenda") ?? ""),
        templateBirthday: String(fd.get("templateBirthday") ?? ""),
        templateConfirmationVariantsText: String(
          fd.get("templateConfirmationVariantsText") ?? ""
        ),
        templateFollowup30VariantsText: String(fd.get("templateFollowup30VariantsText") ?? ""),
        templateFollowup60VariantsText: String(fd.get("templateFollowup60VariantsText") ?? ""),
        templateSundayBlastVariantsText: String(
          fd.get("templateSundayBlastVariantsText") ?? ""
        ),
        templateEmptyAgendaVariantsText: String(
          fd.get("templateEmptyAgendaVariantsText") ?? ""
        ),
        templateBirthdayVariantsText: String(fd.get("templateBirthdayVariantsText") ?? ""),
      });
      if (result.ok) setMsg("Pronto — regras salvas nesta unidade.");
      else setErr(result.error);
    });
  }

  return (
    <form className="agent-config-form disparos-form" onSubmit={onSubmit}>
      <div className="agent-config-intro disparos-intro">
        <strong>O que é esta tela?</strong>
        <p>
          Aqui você define as mensagens automáticas no WhatsApp: confirmar horário de amanhã,
          chamar quem sumiu, lembrar aniversário. Comece só pela confirmação. Deixe o{" "}
          <em>modo seguro</em> ligado até os textos ficarem do jeito da casa.
        </p>
      </div>

      <ConfigSectionCard
        title="1. Modo seguro"
        description="Enquanto estiver ligado, o sistema só ensaia — o cliente não recebe no Zap."
        accent="orange"
      >
        <Toggle
          id="dryRunEnabled"
          name="dryRunEnabled"
          checked={dryRunEnabled}
          onChange={setDryRunEnabled}
          label="Modo seguro (recomendado)"
          hint="Desligue só quando a Fábrica liberar o envio de verdade e você já tiver validado os textos."
        />
        <label className="filter-field" style={{ marginTop: 12, maxWidth: 280 }}>
          <span>Quantas mensagens no máximo por dia?</span>
          <input
            name="dailyCap"
            type="number"
            min={10}
            max={500}
            className="search-input"
            defaultValue={initial.dailyCap}
          />
          <small className="muted">Sugestão: 80 a 120. Evita saturar o WhatsApp.</small>
        </label>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="2. Confirmação de amanhã"
        description="A mais importante. Pede OK no Zap; quando o cliente responde, o horário fica verde na agenda."
        accent="green"
      >
        <div className="disparos-hero-toggle">
          <Toggle
            id="confirmationEnabled"
            name="confirmationEnabled"
            checked={confirmationEnabled}
            onChange={setConfirmationEnabled}
            label="Ligar confirmação de amanhã"
            hint="Comece por aqui. Deixe as outras mensagens desligadas no início."
          />
        </div>

        <div className="config-grid" style={{ marginTop: 12 }}>
          <label className="filter-field">
            <span>A partir de que horas começar a avisar?</span>
            <input
              name="confirmationSendTime"
              className="search-input"
              defaultValue={initial.confirmationSendTime}
              pattern="\d{1,2}:\d{2}"
              placeholder="18:00"
              required
            />
            <small className="muted">
              Ex.: 18:00 — o sistema espalha os envios perto desse horário (não manda tudo de uma
              vez).
            </small>
          </label>
          <div className="filter-field" style={{ display: "grid", gap: 8, alignContent: "start" }}>
            <Toggle
              id="skipSundays"
              name="skipSundays"
              checked={skipSundays}
              onChange={setSkipSundays}
              label="Não mandar no domingo"
            />
            <Toggle
              id="skipHolidays"
              name="skipHolidays"
              checked={skipHolidays}
              onChange={setSkipHolidays}
              label="Não mandar em feriado"
            />
            <Toggle
              id="soundOnConfirmEnabled"
              name="soundOnConfirmEnabled"
              checked={soundOnConfirmEnabled}
              onChange={setSoundOnConfirmEnabled}
              label="Avisar no painel quando o cliente confirmar"
            />
          </div>
        </div>

        <label className="filter-field" style={{ marginTop: 14 }}>
          <span>Texto principal</span>
          <textarea
            name="templateConfirmation"
            className="search-input"
            rows={3}
            value={tplConfirm}
            onChange={(e) => setTplConfirm(e.target.value)}
            maxLength={2000}
            placeholder="Oi {{nome}}! Confirmando amanhã…"
          />
          <small className="muted">
            Pode usar: nome, data, hora, profissional, barbearia — escreva como{" "}
            <code>{"{{nome}}"}</code>, <code>{"{{data}}"}</code>, <code>{"{{hora}}"}</code>,{" "}
            <code>{"{{profissional}}"}</code>, <code>{"{{barbearia}}"}</code>.
          </small>
        </label>

        <label className="filter-field" style={{ marginTop: 10 }}>
          <span>Outras formas de dizer a mesma coisa (1 por linha)</span>
          <textarea
            name="templateConfirmationVariantsText"
            className="search-input"
            rows={4}
            value={tplConfirmVariants}
            onChange={(e) => setTplConfirmVariants(e.target.value)}
            placeholder={"Oi {{nome}}, confirmando amanhã…\n{{nome}}, tudo bem? Passando pra confirmar…"}
          />
          <small className="muted">
            Cada cliente recebe uma variação. Assim não parece mensagem de robô em massa.
          </small>
        </label>

        <div className="disparos-preview-grid">
          <div className="disparos-bubble">
            <span className="disparos-bubble-label">Exemplo Carlos</span>
            <p>{previewA}</p>
          </div>
          <div className="disparos-bubble">
            <span className="disparos-bubble-label">Exemplo Ana</span>
            <p>{previewB}</p>
          </div>
        </div>
      </ConfigSectionCard>

      <div className="disparos-fold">
        <button
          type="button"
          className="btn btn-outline disparos-fold-btn"
          onClick={() => setShowMoreMessages((v) => !v)}
          aria-expanded={showMoreMessages}
        >
          {showMoreMessages ? "Esconder outras mensagens" : "Outras mensagens (opcional)"}
        </button>
        {showMoreMessages ? (
          <ConfigSectionCard
            title="Outras mensagens"
            description="Deixe desligado até a confirmação estar estável. Depois ligue uma de cada vez."
            accent="blue"
          >
            <div className="disparos-optional-list">
              <Toggle
                id="followup30Enabled"
                name="followup30Enabled"
                checked={followup30Enabled}
                onChange={setFollowup30Enabled}
                label="Chamar quem sumiu (~30 dias)"
                hint="Cliente que não vem há cerca de um mês."
              />
              <Toggle
                id="followup60Enabled"
                name="followup60Enabled"
                checked={followup60Enabled}
                onChange={setFollowup60Enabled}
                label="Chamar quem sumiu há mais tempo (~60 dias)"
              />
              <Toggle
                id="emptyAgendaEnabled"
                name="emptyAgendaEnabled"
                checked={emptyAgendaEnabled}
                onChange={setEmptyAgendaEnabled}
                label="Avisar quando o profissional está sem agenda amanhã"
                hint="Só para poucos clientes fiéis daquele profissional."
              />
              <Toggle
                id="birthdayEnabled"
                name="birthdayEnabled"
                checked={birthdayEnabled}
                onChange={setBirthdayEnabled}
                label="Parabéns automático no aniversário"
                hint="Também dá pra mandar na mão em Clientes → Aniversariantes."
              />
              <Toggle
                id="sundayBlastEnabled"
                name="sundayBlastEnabled"
                checked={sundayBlastEnabled}
                onChange={setSundayBlastEnabled}
                label="Mensagem geral no domingo"
                hint="Ainda bloqueada no servidor — não use por enquanto."
              />
            </div>

            <details className="disparos-details">
              <summary>Editar textos dessas mensagens</summary>
              <div className="config-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
                <label className="filter-field">
                  <span>Texto ~30 dias</span>
                  <textarea
                    name="templateFollowup30"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateFollowup30}
                    maxLength={2000}
                  />
                </label>
                <label className="filter-field">
                  <span>Variações (~30 dias, 1 por linha)</span>
                  <textarea
                    name="templateFollowup30VariantsText"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateFollowup30Variants.join("\n")}
                  />
                </label>
                <label className="filter-field">
                  <span>Texto ~60 dias</span>
                  <textarea
                    name="templateFollowup60"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateFollowup60}
                    maxLength={2000}
                  />
                </label>
                <label className="filter-field">
                  <span>Variações (~60 dias)</span>
                  <textarea
                    name="templateFollowup60VariantsText"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateFollowup60Variants.join("\n")}
                  />
                </label>
                <label className="filter-field">
                  <span>Agenda vazia</span>
                  <textarea
                    name="templateEmptyAgenda"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateEmptyAgenda}
                    maxLength={2000}
                  />
                </label>
                <label className="filter-field">
                  <span>Variações agenda vazia</span>
                  <textarea
                    name="templateEmptyAgendaVariantsText"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateEmptyAgendaVariants.join("\n")}
                  />
                </label>
                <label className="filter-field">
                  <span>Aniversário (use {"{{desconto}}"})</span>
                  <textarea
                    name="templateBirthday"
                    className="search-input"
                    rows={2}
                    value={tplBirthday}
                    onChange={(e) => setTplBirthday(e.target.value)}
                    maxLength={2000}
                  />
                  <small className="muted">Exemplo: {birthdayPreview}</small>
                </label>
                <label className="filter-field">
                  <span>Variações aniversário</span>
                  <textarea
                    name="templateBirthdayVariantsText"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateBirthdayVariants.join("\n")}
                  />
                </label>
                <label className="filter-field">
                  <span>% de desconto no aniversário</span>
                  <input
                    name="birthdayDiscountPct"
                    type="number"
                    min={0}
                    max={100}
                    className="search-input"
                    defaultValue={initial.birthdayDiscountPct}
                  />
                </label>
                <label className="filter-field">
                  <span>Texto domingo</span>
                  <textarea
                    name="templateSundayBlast"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateSundayBlast}
                    maxLength={2000}
                  />
                </label>
                <label className="filter-field">
                  <span>Variações domingo</span>
                  <textarea
                    name="templateSundayBlastVariantsText"
                    className="search-input"
                    rows={2}
                    defaultValue={initial.templateSundayBlastVariants.join("\n")}
                  />
                </label>
              </div>
            </details>
          </ConfigSectionCard>
        ) : null}
      </div>

      <div className="disparos-fold">
        <button
          type="button"
          className="btn btn-ghost disparos-fold-btn"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? "Esconder ajustes finos" : "Ajustes finos (dias do mês, datas fechadas…)"}
        </button>
        {showAdvanced ? (
          <ConfigSectionCard
            title="Ajustes finos"
            description="Só se a recepção quiser afinar calendário e retornos."
            accent="slate"
          >
            <div className="config-grid">
              <label className="filter-field">
                <span>Dias do mês para chamar quem sumiu</span>
                <input
                  name="followupMonthDaysText"
                  className="search-input"
                  defaultValue={initial.followupMonthDays.join(",")}
                  placeholder="5,6,10,11,20,21"
                />
              </label>
              <label className="filter-field">
                <span>Após quantos dias sem vir (~30)</span>
                <input
                  name="followup30Days"
                  type="number"
                  min={7}
                  max={365}
                  className="search-input"
                  defaultValue={initial.followup30Days}
                />
              </label>
              <label className="filter-field">
                <span>Após quantos dias sem vir (~60)</span>
                <input
                  name="followup60Days"
                  type="number"
                  min={14}
                  max={730}
                  className="search-input"
                  defaultValue={initial.followup60Days}
                />
              </label>
              <label className="filter-field">
                <span>Domingo: só quem veio nos últimos N dias</span>
                <input
                  name="blastActiveWithinDays"
                  type="number"
                  min={30}
                  max={730}
                  className="search-input"
                  defaultValue={initial.blastActiveWithinDays}
                />
              </label>
              <label className="filter-field config-span-2">
                <span>Datas fechadas extras (uma por linha, ano-mês-dia)</span>
                <textarea
                  name="customClosedDatesText"
                  className="search-input"
                  rows={3}
                  defaultValue={initial.customClosedDates.join("\n")}
                  placeholder="2026-12-24"
                />
              </label>
            </div>
          </ConfigSectionCard>
        ) : (
          <>
            <input type="hidden" name="followupMonthDaysText" value={initial.followupMonthDays.join(",")} />
            <input type="hidden" name="followup30Days" value={initial.followup30Days} />
            <input type="hidden" name="followup60Days" value={initial.followup60Days} />
            <input type="hidden" name="blastActiveWithinDays" value={initial.blastActiveWithinDays} />
            <input
              type="hidden"
              name="customClosedDatesText"
              value={initial.customClosedDates.join("\n")}
            />
            {!showMoreMessages ? (
              <>
                <input type="hidden" name="templateFollowup30" value={initial.templateFollowup30} />
                <input
                  type="hidden"
                  name="templateFollowup30VariantsText"
                  value={initial.templateFollowup30Variants.join("\n")}
                />
                <input type="hidden" name="templateFollowup60" value={initial.templateFollowup60} />
                <input
                  type="hidden"
                  name="templateFollowup60VariantsText"
                  value={initial.templateFollowup60Variants.join("\n")}
                />
                <input
                  type="hidden"
                  name="templateEmptyAgenda"
                  value={initial.templateEmptyAgenda}
                />
                <input
                  type="hidden"
                  name="templateEmptyAgendaVariantsText"
                  value={initial.templateEmptyAgendaVariants.join("\n")}
                />
                <input type="hidden" name="templateBirthday" value={tplBirthday} />
                <input
                  type="hidden"
                  name="templateBirthdayVariantsText"
                  value={initial.templateBirthdayVariants.join("\n")}
                />
                <input
                  type="hidden"
                  name="birthdayDiscountPct"
                  value={initial.birthdayDiscountPct}
                />
                <input
                  type="hidden"
                  name="templateSundayBlast"
                  value={initial.templateSundayBlast}
                />
                <input
                  type="hidden"
                  name="templateSundayBlastVariantsText"
                  value={initial.templateSundayBlastVariants.join("\n")}
                />
              </>
            ) : null}
          </>
        )}
      </div>

      {msg ? <p className="form-ok">{msg}</p> : null}
      {err ? <p className="form-error">{err}</p> : null}

      <div className="disparos-save-bar">
        <button type="submit" className={`btn btn-primary${pending ? " is-pending" : ""}`} disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <span className="muted">Salva só nesta unidade (Donna 1 / Donna 2).</span>
      </div>
    </form>
  );
}
