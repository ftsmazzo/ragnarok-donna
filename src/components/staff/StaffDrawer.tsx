"use client";

import { useState, useTransition } from "react";
import type { StaffDetail } from "@/server/staff/queries";
import type { StaffPerformance } from "@/server/staff/performance";
import {
  createStaffAction,
  deactivateStaffAction,
  reactivateStaffAction,
  saveStaffSchedulesAction,
  updateStaffAction,
} from "@/app/(painel)/profissionais/actions";
import { StaffPerformancePanel } from "@/components/staff/StaffPerformancePanel";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { weekdayLabel } from "@/lib/format";

type Mode = "new" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  staff: StaffDetail | null;
  performance: StaffPerformance | null;
  listFilter?: string;
  listQ?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
};

function slotValue(
  schedules: StaffDetail["schedules"],
  weekday: number,
  slotIndex: number,
  part: "start" | "end"
) {
  const s = schedules.find((x) => x.weekday === weekday && x.slotIndex === slotIndex);
  if (!s) return "";
  return part === "start" ? s.startTime : s.endTime;
}

function commissionPct(bps: number | null): string {
  if (bps == null) return "";
  return String(bps / 100);
}

export function StaffDrawer({
  open,
  mode,
  staff,
  performance,
  listFilter,
  listQ,
  onClose,
  onSaved,
}: Props) {
  const [error, setError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [tab, setTab] = useState<"cadastro" | "jornada" | "performance">("cadastro");
  const [pending, startTransition] = useTransition();

  const isEdit = mode === "edit" && staff;
  const isRemoved = Boolean(staff?.deletedAt || !staff?.isActive);
  const schedules = staff?.schedules ?? [];

  function handleCadastroSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEdit
        ? await updateStaffAction(staff.id, formData)
        : await createStaffAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.id);
    });
  }

  function handleJornadaSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!staff) return;
    setError("");
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await saveStaffSchedulesAction(staff.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(staff.id);
    });
  }

  function handleReactivate() {
    if (!staff) return;
    setError("");
    startTransition(async () => {
      const result = await reactivateStaffAction(staff.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(staff.id);
    });
  }

  function handleDeactivateConfirm() {
    if (!staff) return;
    setError("");
    startTransition(async () => {
      const result = await deactivateStaffAction(staff.id);
      setConfirmDeactivate(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(staff.id);
    });
  }

  const cadastroForm = (
    <form id="staff-form" className="form-stack" onSubmit={handleCadastroSubmit}>
      <label className="form-field">
        <span>Nome *</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={staff?.name ?? ""}
          disabled={isRemoved}
          autoFocus={!isEdit}
        />
      </label>

      <label className="form-field">
        <span>Apelido</span>
        <input
          name="nickname"
          maxLength={80}
          defaultValue={staff?.nickname ?? ""}
          disabled={isRemoved}
          placeholder="Como aparece na agenda"
        />
      </label>

      <label className="form-field">
        <span>Telefone</span>
        <input
          name="phone"
          type="tel"
          maxLength={32}
          defaultValue={staff?.phone ?? ""}
          disabled={isRemoved}
        />
      </label>

      <label className="form-field">
        <span>E-mail</span>
        <input
          name="email"
          type="email"
          maxLength={200}
          defaultValue={staff?.email ?? ""}
          disabled={isRemoved}
        />
      </label>

      <div className="form-row-2">
        <label className="form-field">
          <span>Comissão padrão (%)</span>
          <input
            name="commissionPct"
            type="number"
            min={0}
            max={100}
            step={0.01}
            defaultValue={commissionPct(staff?.defaultCommissionBps ?? null)}
            disabled={isRemoved}
            placeholder="40"
          />
        </label>

        <label className="form-field">
          <span>Cor na agenda</span>
          <input
            name="color"
            type="color"
            defaultValue={staff?.color ?? "#6B5B95"}
            disabled={isRemoved}
          />
        </label>
      </div>

      <label className="form-check">
        <input
          name="isBookable"
          type="checkbox"
          defaultChecked={staff?.isBookable ?? true}
          disabled={isRemoved}
        />
        <span>Disponível para agendamento online / agenda</span>
      </label>
    </form>
  );

  const jornadaForm = isEdit ? (
    <form id="jornada-form" className="form-stack" onSubmit={handleJornadaSubmit}>
      <p className="client-profile-hint">
        Defina até 2 turnos por dia. Deixe vazio para folga. Horários no fuso da unidade.
      </p>
      <div className="schedule-grid">
        <div className="schedule-grid-head">
          <span>Dia</span>
          <span>Turno 1</span>
          <span>Turno 2</span>
        </div>
        {[0, 1, 2, 3, 4, 5, 6].map((wd) => (
          <div key={wd} className="schedule-grid-row">
            <span className="schedule-day">{weekdayLabel(wd)}</span>
            <div className="schedule-slot">
              <input
                name={`wd_${wd}_start_1`}
                type="time"
                defaultValue={slotValue(schedules, wd, 1, "start")}
                disabled={isRemoved}
              />
              <span>–</span>
              <input
                name={`wd_${wd}_end_1`}
                type="time"
                defaultValue={slotValue(schedules, wd, 1, "end")}
                disabled={isRemoved}
              />
            </div>
            <div className="schedule-slot">
              <input
                name={`wd_${wd}_start_2`}
                type="time"
                defaultValue={slotValue(schedules, wd, 2, "start")}
                disabled={isRemoved}
              />
              <span>–</span>
              <input
                name={`wd_${wd}_end_2`}
                type="time"
                defaultValue={slotValue(schedules, wd, 2, "end")}
                disabled={isRemoved}
              />
            </div>
          </div>
        ))}
      </div>
    </form>
  ) : (
    <p className="client-profile-empty">Salve o cadastro primeiro para configurar a jornada.</p>
  );

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={isEdit ? staff.name : "Novo profissional"}
        subtitle={
          isEdit
            ? staff.externalSource
              ? `Importado · ${staff.externalSource}`
              : "Equipe · jornada e comissão"
            : "Dados básicos da equipe"
        }
        width={isEdit ? 600 : 420}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
            {isEdit && !isRemoved ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmDeactivate(true)}
                disabled={pending}
              >
                Inativar
              </button>
            ) : null}
            {isEdit && isRemoved ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleReactivate}
                disabled={pending}
              >
                Reativar
              </button>
            ) : null}
            {!isRemoved ? (
              tab === "jornada" && isEdit ? (
                <button
                  type="submit"
                  form="jornada-form"
                  className="btn btn-primary"
                  disabled={pending}
                >
                  {pending ? "Salvando…" : "Salvar jornada"}
                </button>
              ) : (
                <button
                  type="submit"
                  form="staff-form"
                  className="btn btn-primary"
                  disabled={pending}
                >
                  {pending ? "Salvando…" : "Salvar"}
                </button>
              )
            ) : null}
          </>
        }
      >
        {error ? <div className="form-error">{error}</div> : null}

        {isEdit ? (
          <>
            <nav className="drawer-tabs" aria-label="Seções">
              <button
                type="button"
                className={tab === "cadastro" ? "drawer-tab is-active" : "drawer-tab"}
                onClick={() => setTab("cadastro")}
              >
                Cadastro
              </button>
              <button
                type="button"
                className={tab === "jornada" ? "drawer-tab is-active" : "drawer-tab"}
                onClick={() => setTab("jornada")}
              >
                Jornada
                {staff.scheduleSlots > 0 ? (
                  <span className="drawer-tab-badge">{staff.scheduleSlots}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={tab === "performance" ? "drawer-tab is-active" : "drawer-tab"}
                onClick={() => setTab("performance")}
              >
                Performance
              </button>
            </nav>
            {tab === "cadastro" ? cadastroForm : null}
            {tab === "jornada" ? jornadaForm : null}
            {tab === "performance" && performance && staff ? (
              <StaffPerformancePanel
                staffId={staff.id}
                performance={performance}
                listFilter={listFilter}
                listQ={listQ}
              />
            ) : null}
          </>
        ) : (
          cadastroForm
        )}
      </Drawer>

      <Modal
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        title="Inativar profissional"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmDeactivate(false)}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeactivateConfirm}
              disabled={pending}
            >
              {pending ? "Inativando…" : "Confirmar"}
            </button>
          </>
        }
      >
        <p>
          O profissional <strong>{staff?.name}</strong> será removido da agenda bookable. Histórico
          de agendamentos e comandas permanece no sistema.
        </p>
      </Modal>
    </>
  );
}
