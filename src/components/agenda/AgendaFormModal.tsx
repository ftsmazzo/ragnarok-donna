"use client";

import { useState, useTransition } from "react";
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
  const [pending, startTransition] = useTransition();

  const title = MODE_TITLE[mode];
  const needsClient = mode !== "block";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    formData.set("date", slot.date);
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
        <input type="hidden" name="hour" value={slot.hour} />

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
          <input
            name="hourDisplay"
            type="text"
            readOnly
            value={`${String(slot.hour).padStart(2, "0")}:00`}
          />
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
          <span>Observações</span>
          <textarea name="notes" rows={2} maxLength={500} placeholder="Opcional" />
        </label>

        {mode === "encaixe" ? (
          <p className="client-profile-hint muted">
            Encaixe permite sobrepor horários já ocupados.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
