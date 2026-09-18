"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { ClientPicker } from "@/components/agenda/ClientPicker";
import type { AgendaPickerService, AgendaStaff } from "@/server/agenda/types";
import {
  createBlockAction,
  scheduleAppointmentAction,
  scheduleEncaixeAction,
  scheduleRecurringAction,
} from "@/app/(painel)/agenda/actions";
import { useToast } from "@/components/ui/Toast";
import type { RecurringSlotResult } from "@/server/agenda/recurring";

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
  onOpenDate?: (date: string) => void;
};

const MODE_TITLE: Record<AgendaFormMode, string> = {
  schedule: "Agendar",
  block: "Bloquear horário",
  encaixe: "Encaixe",
};

const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const DURATIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 150, 180];

export function AgendaFormModal({ open, mode, slot, staff, services, onClose, onSaved, onOpenDate }: Props) {
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [hour, setHour] = useState(slot.hour);
  const [minute, setMinute] = useState(slot.minute ?? 0);
  const [durationMin, setDurationMin] = useState(30);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"once" | "series">("once");
  const [periodicity, setPeriodicity] = useState("weekly");
  const [quantity, setQuantity] = useState(5);
  const [seriesSlots, setSeriesSlots] = useState<RecurringSlotResult[] | null>(null);
  const [seriesWarning, setSeriesWarning] = useState("");
  const { showToast } = useToast();

  const title = MODE_TITLE[mode];
  const needsClient = mode !== "block";
  const timeEditable = true;

  useEffect(() => {
    if (!open) return;
    setHour(slot.hour);
    setMinute(slot.minute ?? 0);
    setDurationMin(mode === "block" ? 60 : 30);
    setClientId("");
    setError("");
    setKind("once");
    setSeriesSlots(null);
    setSeriesWarning("");
  }, [open, slot.hour, slot.minute, slot.staffId, slot.date, mode]);

  function handleServiceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const svc = services.find((s) => s.id === id);
    if (svc) setDurationMin(svc.durationMin);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    formData.set("date", slot.date);
    formData.set("hour", String(hour));
    formData.set("minute", String(minute));
    formData.set("durationMin", String(durationMin));
    if (!formData.get("staffId")) formData.set("staffId", slot.staffId);
    if (needsClient && clientId) formData.set("clientId", clientId);

    if (needsClient && !clientId) {
      setError("Selecione um cliente na lista");
      return;
    }

    startTransition(async () => {
      if (mode === "schedule" && kind === "series") {
        formData.set("periodicity", periodicity);
        formData.set("quantity", String(quantity));
        const result = await scheduleRecurringAction(formData);
        if (!result.ok) {
          setError(result.error);
          showToast(result.error, "error");
          return;
        }
        setSeriesSlots(result.slots);
        setSeriesWarning(result.warning ?? "");
        const booked = result.slots.filter((s) => s.ok).length;
        const failed = result.slots.length - booked;
        showToast(
          failed
            ? `${booked} horário(s) agendado(s), ${failed} em vermelho`
            : `${booked} horário(s) agendado(s)`,
          failed ? "error" : "success"
        );
        onSaved();
        return;
      }

      const action =
        mode === "block"
          ? createBlockAction
          : mode === "encaixe"
            ? scheduleEncaixeAction
            : scheduleAppointmentAction;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        showToast(result.error, "error");
        return;
      }
      const okMsg =
        mode === "block"
          ? "Bloqueio salvo"
          : mode === "encaixe"
            ? "Encaixe agendado"
            : "Horário agendado";
      showToast(okMsg, "success");
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
            {pending ? "Salvando…" : seriesSlots ? "Agendar de novo" : "Confirmar"}
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      {mode === "schedule" ? (
        <div className="agenda-form-tabs" role="tablist">
          <button
            type="button"
            className={kind === "once" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            aria-pressed={kind === "once"}
            onClick={() => setKind("once")}
          >
            Agendar
          </button>
          <button
            type="button"
            className={kind === "series" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            aria-pressed={kind === "series"}
            onClick={() => setKind("series")}
          >
            Agenda recorrente
          </button>
        </div>
      ) : null}
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
          {timeEditable ? (
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
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </label>

        <label className="form-field">
          <span>Duração (min) *</span>
          <select
            name="durationMin"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            required
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </label>

        {mode === "block" ? null : (
          <>
            <ClientPicker
              value={clientId}
              required
              onChange={(id) => setClientId(id)}
            />
            <input type="hidden" name="clientId" value={clientId} />

            <label className="form-field">
              <span>Serviço</span>
              <select name="serviceId" defaultValue="" onChange={handleServiceChange}>
                <option value="">Padrão (duração acima)</option>
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

        {mode === "schedule" && kind === "series" ? (
          <>
            <label className="form-field">
              <span>Periodicidade *</span>
              <select
                name="periodicity"
                value={periodicity}
                onChange={(e) => setPeriodicity(e.target.value)}
                required
              >
                <option value="weekly">Semanal</option>
                <option value="quinzenal">Quinzenal (15 dias)</option>
                <option value="every_2_weeks">A cada duas semanas</option>
                <option value="every_3_weeks">A cada três semanas</option>
                <option value="monthly">Mensal</option>
              </select>
            </label>
            <label className="form-field">
              <span>Quantidade *</span>
              <select
                name="quantity"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {seriesWarning ? <p className="client-profile-hint">{seriesWarning}</p> : null}
        {seriesSlots ? (
          <ul className="series-result">
            {seriesSlots.map((s) => (
              <li key={s.date} className={s.ok ? "ok" : "bad"}>
                <button
                  type="button"
                  className="series-result-open"
                  onClick={() => onOpenDate?.(s.date)}
                >
                  {s.date.split("-").reverse().join("/")} — {s.ok ? "agendado" : s.reason}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </Modal>
  );
}
