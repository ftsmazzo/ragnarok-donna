"use client";

import { useMemo, useState, useTransition } from "react";
import { saveOutreachSettingsAction } from "@/app/(painel)/configuracoes/disparos/actions";
import { ConfigSectionCard } from "@/components/config/ConfigSectionCard";
import { Toggle } from "@/components/ui/Toggle";
import type { OutreachSettingsView } from "@/server/outreach/defaults";
import { renderOutreachTemplate } from "@/server/outreach/templates";

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

  const [confirmationEnabled, setConfirmationEnabled] = useState(initial.confirmationEnabled);
  const [followup30Enabled, setFollowup30Enabled] = useState(initial.followup30Enabled);
  const [followup60Enabled, setFollowup60Enabled] = useState(initial.followup60Enabled);
  const [sundayBlastEnabled, setSundayBlastEnabled] = useState(initial.sundayBlastEnabled);
  const [emptyAgendaEnabled, setEmptyAgendaEnabled] = useState(initial.emptyAgendaEnabled);
  const [soundOnConfirmEnabled, setSoundOnConfirmEnabled] = useState(
    initial.soundOnConfirmEnabled
  );
  const [skipSundays, setSkipSundays] = useState(initial.skipSundays);
  const [skipHolidays, setSkipHolidays] = useState(initial.skipHolidays);

  const [tplConfirm, setTplConfirm] = useState(initial.templateConfirmation);
  const preview = useMemo(
    () =>
      renderOutreachTemplate(tplConfirm, {
        nome: "Carlos",
        data: "12/09",
        hora: "15:00",
        profissional: "Luciano",
        barbearia: "Ragnarok",
      }),
    [tplConfirm]
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
      });
      if (result.ok) setMsg("Regras salvas nesta unidade.");
      else setErr(result.error);
    });
  }

  return (
    <form className="agent-config-form" onSubmit={onSubmit}>
      <div className="agent-config-intro">
        <strong>Regras da casa.</strong> Tudo começa desligado. Liga só o que a unidade quer usar.
        Placeholders: {"{{nome}}"}, {"{{data}}"}, {"{{hora}}"}, {"{{profissional}}"}, {"{{barbearia}}"}.
      </div>

      <ConfigSectionCard
        title="Liga / desliga"
        description="Cada disparo só roda se estiver ligado."
        accent="orange"
      >
        <div className="config-grid" style={{ gridTemplateColumns: "1fr" }}>
          <Toggle
            id="confirmationEnabled"
            name="confirmationEnabled"
            checked={confirmationEnabled}
            onChange={setConfirmationEnabled}
            label="Confirmação diária (amanhã)"
            hint="Envia WhatsApp pedindo OK; resposta OK deixa o horário verde."
          />
          <Toggle
            id="followup30Enabled"
            name="followup30Enabled"
            checked={followup30Enabled}
            onChange={setFollowup30Enabled}
            label="Retorno ~30 dias sem vir"
          />
          <Toggle
            id="followup60Enabled"
            name="followup60Enabled"
            checked={followup60Enabled}
            onChange={setFollowup60Enabled}
            label="Retorno ~60 dias sem vir"
          />
          <Toggle
            id="sundayBlastEnabled"
            name="sundayBlastEnabled"
            checked={sundayBlastEnabled}
            onChange={setSundayBlastEnabled}
            label="Blast no domingo"
          />
          <Toggle
            id="emptyAgendaEnabled"
            name="emptyAgendaEnabled"
            checked={emptyAgendaEnabled}
            onChange={setEmptyAgendaEnabled}
            label="Agenda vazia do profissional"
            hint="Se um barbeiro não tem horário amanhã, avisa só os clientes dele."
          />
          <Toggle
            id="soundOnConfirmEnabled"
            name="soundOnConfirmEnabled"
            checked={soundOnConfirmEnabled}
            onChange={setSoundOnConfirmEnabled}
            label="Som / vibração quando cliente confirma no Zap"
          />
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="Horário e calendário"
        description="Confirmação só dispara depois do horário. Domingo/feriado podem ser pulados."
        accent="blue"
      >
        <div className="config-grid">
          <label className="filter-field">
            <span>Horário da confirmação (SP)</span>
            <input
              name="confirmationSendTime"
              className="search-input"
              defaultValue={initial.confirmationSendTime}
              pattern="\d{1,2}:\d{2}"
              placeholder="18:00"
              required
            />
          </label>
          <label className="filter-field">
            <span>Dias do mês (retorno 30/60)</span>
            <input
              name="followupMonthDaysText"
              className="search-input"
              defaultValue={initial.followupMonthDays.join(",")}
              placeholder="5,6,10,11,20,21"
            />
          </label>
          <label className="filter-field">
            <span>Limiar 30 dias</span>
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
            <span>Limiar 60 dias</span>
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
            <span>Blast: ativos nos últimos N dias</span>
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
            <span>Datas fechadas extras (YYYY-MM-DD, uma por linha)</span>
            <textarea
              name="customClosedDatesText"
              className="search-input"
              rows={3}
              defaultValue={initial.customClosedDates.join("\n")}
              placeholder="2026-12-24"
            />
          </label>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <Toggle
            id="skipSundays"
            name="skipSundays"
            checked={skipSundays}
            onChange={setSkipSundays}
            label="Não disparar confirmação em domingo"
          />
          <Toggle
            id="skipHolidays"
            name="skipHolidays"
            checked={skipHolidays}
            onChange={setSkipHolidays}
            label="Não disparar confirmação em feriado nacional"
          />
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard title="Textos" description="Mensagens enviadas no WhatsApp." accent="green">
        <div className="config-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="filter-field">
            <span>Confirmação D+1</span>
            <textarea
              name="templateConfirmation"
              className="search-input"
              rows={3}
              value={tplConfirm}
              onChange={(e) => setTplConfirm(e.target.value)}
              maxLength={2000}
            />
            <small style={{ color: "var(--muted)", display: "block", marginTop: 6 }}>
              Preview: {preview}
            </small>
          </label>
          <label className="filter-field">
            <span>Retorno 30 dias</span>
            <textarea
              name="templateFollowup30"
              className="search-input"
              rows={2}
              defaultValue={initial.templateFollowup30}
              maxLength={2000}
            />
          </label>
          <label className="filter-field">
            <span>Retorno 60 dias</span>
            <textarea
              name="templateFollowup60"
              className="search-input"
              rows={2}
              defaultValue={initial.templateFollowup60}
              maxLength={2000}
            />
          </label>
          <label className="filter-field">
            <span>Blast domingo</span>
            <textarea
              name="templateSundayBlast"
              className="search-input"
              rows={2}
              defaultValue={initial.templateSundayBlast}
              maxLength={2000}
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
        </div>
      </ConfigSectionCard>

      {msg ? <p className="form-ok">{msg}</p> : null}
      {err ? <p className="form-error">{err}</p> : null}

      <div className="agent-config-actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar regras"}
        </button>
      </div>
    </form>
  );
}
