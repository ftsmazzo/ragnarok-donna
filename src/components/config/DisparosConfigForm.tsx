"use client";

import { useMemo, useState, useTransition } from "react";
import { saveOutreachSettingsAction } from "@/app/(painel)/configuracoes/disparos/actions";
import { ConfigSectionCard } from "@/components/config/ConfigSectionCard";
import { Toggle } from "@/components/ui/Toggle";
import type { OutreachSettingsView } from "@/server/outreach/defaults";
import {
  normalizeTemplatePool,
  pickVariantTemplate,
  renderOutreachTemplate,
} from "@/server/outreach/templates";
import { DEFAULT_OUTREACH_VARIANT_POOLS } from "@/server/outreach/defaults";

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
      if (result.ok) setMsg("Regras salvas nesta unidade.");
      else setErr(result.error);
    });
  }

  return (
    <form className="agent-config-form" onSubmit={onSubmit}>
      <div className="agent-config-intro">
        <strong>Estrutura anti-ban.</strong> Mensagens alternadas + janela horária + teto diário.
        Com dry-run ligado (padrão), a fila roda sem WhatsApp. Só ligue envio real depois de
        validar variantes no painel. Placeholders: {"{{nome}}"}, {"{{data}}"}, {"{{hora}}"},{" "}
        {"{{profissional}}"}, {"{{barbearia}}"}, {"{{desconto}}"}.
      </div>

      <ConfigSectionCard
        title="Segurança / dry-run"
        description="Nunca dispare em massa sem dry-run e caps."
        accent="orange"
      >
        <div className="config-grid" style={{ gridTemplateColumns: "1fr" }}>
          <Toggle
            id="dryRunEnabled"
            name="dryRunEnabled"
            checked={dryRunEnabled}
            onChange={setDryRunEnabled}
            label="Dry-run (simula fila, não manda Zap)"
            hint="Recomendado até validar textos. Mesmo com OUTREACH_DISPATCH_ENABLED=true, dry-run desta unidade bloqueia Evolution."
          />
          <label className="filter-field">
            <span>Teto diário (msgs sent + dry-run)</span>
            <input
              name="dailyCap"
              type="number"
              min={10}
              max={500}
              className="search-input"
              defaultValue={initial.dailyCap}
            />
          </label>
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="Liga / desliga"
        description="Cada disparo só roda se estiver ligado. Comece só pela confirmação."
        accent="orange"
      >
        <div className="config-grid" style={{ gridTemplateColumns: "1fr" }}>
          <Toggle
            id="confirmationEnabled"
            name="confirmationEnabled"
            checked={confirmationEnabled}
            onChange={setConfirmationEnabled}
            label="Confirmação diária (amanhã)"
            hint="Envia pedindo OK; resposta OK deixa o horário verde. Preferido para liberar primeiro."
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
            hint="Também exige OUTREACH_ALLOW_SUNDAY_BLAST=true no servidor."
          />
          <Toggle
            id="emptyAgendaEnabled"
            name="emptyAgendaEnabled"
            checked={emptyAgendaEnabled}
            onChange={setEmptyAgendaEnabled}
            label="Agenda vazia do profissional"
            hint="Cap 8 + cooldown 14d. Só depois da confirmação estável."
          />
          <Toggle
            id="soundOnConfirmEnabled"
            name="soundOnConfirmEnabled"
            checked={soundOnConfirmEnabled}
            onChange={setSoundOnConfirmEnabled}
            label="Som / vibração quando cliente confirma no Zap"
          />
          <Toggle
            id="birthdayEnabled"
            name="birthdayEnabled"
            checked={birthdayEnabled}
            onChange={setBirthdayEnabled}
            label="Aniversariantes automáticos (fila)"
            hint="Preferência: envio manual em Clientes → Aniversariantes."
          />
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        title="Horário e calendário"
        description="Envios espalhados na janela (âncora ±30–60 min). Quiet hours 22h–8h SP."
        accent="blue"
      >
        <div className="config-grid">
          <label className="filter-field">
            <span>Horário âncora da confirmação (SP)</span>
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
          <label className="filter-field">
            <span>Desconto aniversário (%)</span>
            <input
              name="birthdayDiscountPct"
              type="number"
              min={0}
              max={100}
              className="search-input"
              defaultValue={initial.birthdayDiscountPct}
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

      <ConfigSectionCard
        title="Textos e variantes"
        description="Principal + variantes (uma por linha). O sistema alterna por telefone/dia."
        accent="green"
      >
        <div className="config-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="filter-field">
            <span>Confirmação D+1 (principal)</span>
            <textarea
              name="templateConfirmation"
              className="search-input"
              rows={3}
              value={tplConfirm}
              onChange={(e) => setTplConfirm(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="filter-field">
            <span>Variantes da confirmação (1 por linha, até 5)</span>
            <textarea
              name="templateConfirmationVariantsText"
              className="search-input"
              rows={4}
              value={tplConfirmVariants}
              onChange={(e) => setTplConfirmVariants(e.target.value)}
            />
            <small style={{ color: "var(--muted)", display: "block", marginTop: 6 }}>
              Preview A: {previewA}
              <br />
              Preview B: {previewB}
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
            <span>Variantes retorno 30</span>
            <textarea
              name="templateFollowup30VariantsText"
              className="search-input"
              rows={2}
              defaultValue={initial.templateFollowup30Variants.join("\n")}
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
            <span>Variantes retorno 60</span>
            <textarea
              name="templateFollowup60VariantsText"
              className="search-input"
              rows={2}
              defaultValue={initial.templateFollowup60Variants.join("\n")}
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
            <span>Variantes blast</span>
            <textarea
              name="templateSundayBlastVariantsText"
              className="search-input"
              rows={2}
              defaultValue={initial.templateSundayBlastVariants.join("\n")}
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
            <span>Variantes agenda vazia</span>
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
              rows={3}
              value={tplBirthday}
              onChange={(e) => setTplBirthday(e.target.value)}
              maxLength={2000}
            />
            <small style={{ color: "var(--muted)", display: "block", marginTop: 6 }}>
              Preview: {birthdayPreview}
            </small>
          </label>
          <label className="filter-field">
            <span>Variantes aniversário</span>
            <textarea
              name="templateBirthdayVariantsText"
              className="search-input"
              rows={2}
              defaultValue={initial.templateBirthdayVariants.join("\n")}
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
