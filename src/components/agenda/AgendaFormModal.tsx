"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { ClientPicker } from "@/components/agenda/ClientPicker";
import type { AgendaPickerService, AgendaStaff } from "@/server/agenda/types";
import {
  createBlockAction,
  scheduleAppointmentAction,
  scheduleEncaixeAction,
} from "@/app/(painel)/agenda/actions";

export type AgendaFormMode = "schedule" | "block" | "encaixe";

type SlotContext = {
  date: string;
  staffId: string;
  hour: number;
  minute?: number;
};

type Props = {
  open: boolean;
  mode: AgendaFormMode;
  slot: SlotContext;
  staff: AgendaStaff[];
  services: AgendaPickerService[];
  onClose: () => void;
  onSaved: () => void;
};

const MODE_TITLE: Record<AgendaFormMode, string> = {
  schedule: "Agendar",
  block: "Bloquear horário",
  encaixe: "Encaixe",
};

export function AgendaFormModal({ open, mode, slot, staff, services, onClose, onSaved }: Props) {
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [hour, setHour] = useState(slot.hour);
  const [minute, setMinute] = useState(slot.minute ?? 0);
  const [pending, startTransition] = useTransition();

  const title = MODE_TITLE[mode];
  const needsClient = mode !== "block";
  const hourEditable = mode === "encaixe";
  const timeLabel = `${String(slot.hour).padStart(2, "0")}:${String(slot.minute ?? 0).padStart(2, "0")}`;

  useEffect(() => {
    if (!open) return;
    setHour(slot.hour);
    setMinute(slot.minute ?? 0);
    setClientId("");
    setError("");
  }, [open, slot.hour, slot.minute, slot.staffId, slot.date, mode]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    formData.set("date", slot.date);
    formData.set("hour", String(hourEditable ? hour : slot.hour));
    formData.set("minute", String(hourEditable ? minute : (slot.minute ?? 0)));
    if (!formData.get("staffId")) formData.set("staffId", slot.staffId);
    if (needsClient && clientId) formData.set("clientId", clientId);

    if (needsClient && !clientId) {
      setError("Selecione um cliente na lista");
      return;
    }

    startTransition(async () => {
      const action =
        mode === "block"
          ? createBlockAction
          : mode === "encaixe"
            ? scheduleEncaixeAction
            : scheduleAppointmentAction;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" form="agenda-form" className="btn btn-primary" disabled={pending}>
            {pending ? "Salvando…" : "Confirmar"}
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <form id="agenda-form" className="form-stack" onSubmit={handleSubmit}>
        {staff.length > 1 ? (
          <label className="form-field">
            <span>Profissional *</span>
            <select name="staffId" defaultValue={slot.staffId} required>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="staffId" value={slot.staffId} />
        )}

        <label className="form-field">
          <span>Horário *</span>
          {hourEditable ? (
            <div className="form-row-2">
              <select
                name="hour"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                required
              >
                {Array.from({ length: 15 }, (_, i) => i + 8).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}h
                  </option>
                ))}
              </select>
              <select
                name="minute"
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                required
              >
                <option value={0}>00</option>
                <option value={30}>30</option>
              </select>
            </div>
          ) : (
            <>
              <input name="hourDisplay" type="text" readOnly value={timeLabel} />
              <input type="hidden" name="hour" value={slot.hour} />
              <input type="hidden" name="minute" value={slot.minute ?? 0} />
            </>
          )}
        </label>

        {mode === "block" ? (
          <label className="form-field">
            <span>Duração (min)</span>
            <input name="durationMin" type="number" min={15} max={240} step={15} defaultValue={60} />
          </label>
        ) : (
          <>
            <ClientPicker
              value={clientId}
              required
              onChange={(id) => setClientId(id)}
            />
            <input type="hidden" name="clientId" value={clientId} />

            <label className="form-field">
              <span>Serviço</span>
              <select name="serviceId" defaultValue="">
                <option value="">Padrão (30 min)</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.durationMin} min
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="form-field">
          <span>{mode === "block" ? "Motivo do bloqueio *" : "Observações"}</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={500}
            required={mode === "block"}
            minLength={mode === "block" ? 3 : undefined}
            placeholder={
              mode === "block"
                ? "Ex.: almoço, folga, horário pessoal…"
                : "Opcional"
            }
          />
        </label>

        {mode === "encaixe" ? (
          <p className="client-profile-hint muted">
            Encaixe imediato: pode sobrepor horários já ocupados. Ajuste o horário se precisar.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
