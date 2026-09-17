"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import type { AgendaAppointment, AgendaPickerService, AgendaStaff, AppointmentEditScope } from "@/server/agenda/types";
import { updateAppointmentAction } from "@/app/(painel)/agenda/actions";
import { formatDateSp, hourInSp, minuteInSp } from "@/lib/datetime";
import { useToast } from "@/components/ui/Toast";

type Props = {
  open: boolean;
  appointment: AgendaAppointment;
  staff: AgendaStaff[];
  services: AgendaPickerService[];
  onClose: () => void;
  onSaved: () => void;
};

const SCOPE_OPTIONS: { value: AppointmentEditScope; label: string }[] = [
  { value: "time", label: "Só horário" },
  { value: "service", label: "Só serviço" },
  { value: "staff", label: "Só profissional" },
  { value: "duration", label: "Só duração" },
  { value: "time_service", label: "Horário + serviço" },
  { value: "time_staff", label: "Horário + profissional" },
  { value: "service_staff", label: "Serviço + profissional" },
  { value: "all", label: "Tudo" },
];

const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const DURATIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 150, 180];

function scopeFlags(scope: AppointmentEditScope) {
  return {
    time: scope === "time" || scope === "time_service" || scope === "time_staff" || scope === "all",
    service:
      scope === "service" || scope === "time_service" || scope === "service_staff" || scope === "all",
    staff: scope === "staff" || scope === "time_staff" || scope === "service_staff" || scope === "all",
    duration: scope === "duration" || scope === "all" || scope === "time" || scope === "time_service" || scope === "time_staff",
  };
}

export function AgendaEditModal({
  open,
  appointment: a,
  staff,
  services,
  onClose,
  onSaved,
}: Props) {
  const [error, setError] = useState("");
  const [scope, setScope] = useState<AppointmentEditScope>("all");
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  const initialDuration = Math.max(
    5,
    Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000)
  );
  const [date, setDate] = useState(formatDateSp(a.startsAt));
  const [hour, setHour] = useState(hourInSp(a.startsAt));
  const [minute, setMinute] = useState(minuteInSp(a.startsAt));
  const [durationMin, setDurationMin] = useState(initialDuration);
  const [staffId, setStaffId] = useState(a.staffId ?? "");
  const [serviceId, setServiceId] = useState(a.serviceId ?? "");

  const flags = useMemo(() => scopeFlags(scope), [scope]);

  useEffect(() => {
    if (!open) return;
    setScope("all");
    setError("");
    setDate(formatDateSp(a.startsAt));
    setHour(hourInSp(a.startsAt));
    setMinute(minuteInSp(a.startsAt));
    setDurationMin(
      Math.max(5, Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000))
    );
    setStaffId(a.staffId ?? "");
    setServiceId(a.serviceId ?? "");
  }, [open, a]);

  function handleServiceChange(id: string) {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) setDurationMin(svc.durationMin);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData();
    formData.set("id", a.id);
    formData.set("scope", scope);
    formData.set("date", date);
    if (flags.time) {
      formData.set("hour", String(hour));
      formData.set("minute", String(minute));
    }
    if (flags.duration || flags.time) {
      formData.set("durationMin", String(durationMin));
    }
    if (flags.staff) formData.set("staffId", staffId);
    if (flags.service) formData.set("serviceId", serviceId);

    startTransition(async () => {
      const result = await updateAppointmentAction(formData);
      if (!result.ok) {
        setError(result.error);
        showToast(result.error, "error");
        return;
      }
      showToast("Horário atualizado", "success");
      onSaved();
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar agendamento"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" form="agenda-edit-form" className="btn btn-primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <form id="agenda-edit-form" className="form-stack" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Tipo *</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as AppointmentEditScope)}
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {flags.staff ? (
          <label className="form-field">
            <span>Profissional *</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecione…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {flags.time ? (
          <>
            <label className="form-field">
              <span>Data *</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>Horário *</span>
              <div className="form-row-2">
                <select value={hour} onChange={(e) => setHour(Number(e.target.value))} required>
                  {Array.from({ length: 15 }, (_, i) => i + 8).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}h
                    </option>
                  ))}
                </select>
                <select
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  required
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </>
        ) : null}

        {flags.service ? (
          <label className="form-field">
            <span>Serviço</span>
            <select value={serviceId} onChange={(e) => handleServiceChange(e.target.value)}>
              <option value="">Sem serviço</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMin} min
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {flags.duration ? (
          <label className="form-field">
            <span>Duração (min) *</span>
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              required
            >
              {!DURATIONS.includes(durationMin) ? (
                <option value={durationMin}>{durationMin} min</option>
              ) : null}
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <p className="client-profile-hint muted">
          Cliente: <strong>{a.clientName}</strong>
        </p>
      </form>
    </Modal>
  );
}
