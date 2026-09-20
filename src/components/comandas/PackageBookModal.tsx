"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { scheduleFromOrderAction } from "@/app/(painel)/comandas/actions";
import { todaySp } from "@/lib/datetime";
import type { CatalogStaff } from "@/server/orders/types";

type Props = {
  open: boolean;
  orderId: string;
  clientId: string;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  staff: CatalogStaff[];
  onClose: () => void;
  onSaved: () => void;
};

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function PackageBookModal({
  open,
  orderId,
  clientId,
  serviceId,
  serviceName,
  durationMin,
  staff,
  onClose,
  onSaved,
}: Props) {
  const [date, setDate] = useState(todaySp());
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [duration, setDuration] = useState(durationMin);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setDate(todaySp());
    setDuration(durationMin);
    setStaffId((prev) => prev || staff[0]?.id || "");
    setError("");
  }, [open, durationMin, staff]);

  function submit() {
    setError("");
    if (!staffId) {
      setError("Escolha o profissional");
      return;
    }
    startTransition(async () => {
      const result = await scheduleFromOrderAction({
        orderId,
        clientId,
        serviceId,
        staffId,
        date,
        hour,
        minute,
        durationMin: duration,
      });
      if (!result.ok) {
        setError(result.error ?? "Não foi possível agendar");
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
      title="Agendar do pacote"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Salvando…" : "Agendar"}
          </button>
        </>
      }
    >
      <p className="client-profile-hint">
        <strong>{serviceName}</strong> — marca na agenda sem sair da comanda. O crédito continua na
        carteira até usar no atendimento.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-stack">
        <label className="form-field">
          <span>Data *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="form-row-2">
          <label className="form-field">
            <span>Hora *</span>
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Minuto *</span>
            <select value={minute} onChange={(e) => setMinute(Number(e.target.value))}>
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>Profissional *</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
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
        <label className="form-field">
          <span>Duração (min)</span>
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 30))}
          />
        </label>
      </div>
    </Modal>
  );
}
