"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MonthCalendar } from "@/components/agenda/MonthCalendar";
import { Modal } from "@/components/ui/Modal";
import type {
  AgendaAppointment,
  AgendaDayData,
  AgendaStaff,
} from "@/server/agenda/types";
import { formatTimeSp, shortPersonName } from "@/lib/datetime";

type Panel = "available" | "appointments" | null;

type Props = {
  data: AgendaDayData;
  hrefForDate: (date: string) => string;
  onOpenAppointment: (a: AgendaAppointment) => void;
  onBookSlot?: (staffId: string, hour: number) => void;
  canWrite?: boolean;
};

type FreeSlot = {
  key: string;
  staffId: string;
  staffName: string;
  hour: number;
  label: string;
};

function overlapsHour(a: AgendaAppointment, date: string, hour: number): boolean {
  const hh = String(hour).padStart(2, "0");
  const slotStart = new Date(`${date}T${hh}:00:00-03:00`);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  return a.startsAt < slotEnd && a.endsAt > slotStart;
}

function freeSlotsForDay(data: AgendaDayData): FreeSlot[] {
  const active = data.appointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show"
  );
  const out: FreeSlot[] = [];
  for (const s of data.staff) {
    for (const hourLabel of data.hours) {
      const hour = Number(hourLabel.slice(0, 2));
      const busy = active.some(
        (a) => a.staffId === s.id && overlapsHour(a, data.date, hour)
      );
      if (!busy) {
        out.push({
          key: `${s.id}-${hour}`,
          staffId: s.id,
          staffName: s.name,
          hour,
          label: hourLabel,
        });
      }
    }
  }
  return out;
}

function staffName(staff: AgendaStaff[], id: string | null): string {
  if (!id) return "—";
  return staff.find((s) => s.id === id)?.name ?? "—";
}

export function AgendaAside({
  data,
  hrefForDate,
  onOpenAppointment,
  onBookSlot,
  canWrite = false,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null);

  const freeSlots = useMemo(() => freeSlotsForDay(data), [data]);
  const dayAppointments = useMemo(
    () =>
      [...data.appointments]
        .filter((a) => a.status !== "cancelled")
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [data.appointments]
  );

  return (
    <aside className="agenda-aside">
      <div className="agenda-aside-block agenda-aside-cal">
        <MonthCalendar selectedDate={data.date} hrefForDate={hrefForDate} />
      </div>

      <div className="agenda-aside-actions">
        <button
          type="button"
          className="agenda-aside-btn"
          onClick={() => setPanel("available")}
        >
          Horários disponíveis
          <span className="agenda-aside-btn-count">{freeSlots.length}</span>
        </button>
        <button
          type="button"
          className="agenda-aside-btn"
          onClick={() => setPanel("appointments")}
        >
          Lista de Agendamentos
          <span className="agenda-aside-btn-count">{dayAppointments.length}</span>
        </button>
        <Link href="/lista-espera" className="agenda-aside-btn is-primary">
          Lista de Espera
          {data.waitlistCount > 0 ? (
            <span className="agenda-aside-btn-count is-on-primary">
              {data.waitlistCount}
            </span>
          ) : null}
        </Link>
      </div>

      <div className="agenda-aside-block agenda-aside-summary">
        <div className="agenda-aside-summary-row">
          <span>Agendamentos no dia</span>
          <strong>{data.totalAppointments}</strong>
        </div>
        <div className="agenda-aside-summary-row">
          <span>Profissionais na grade</span>
          <strong>{data.staff.length}</strong>
        </div>
        <div className="agenda-aside-summary-row">
          <span>Comandas abertas</span>
          <strong>{data.openOrdersCount}</strong>
        </div>
      </div>

      <Modal
        open={panel === "available"}
        onClose={() => setPanel(null)}
        title={`Horários disponíveis · ${data.date.split("-").reverse().join("/")}`}
        size="md"
      >
        {freeSlots.length === 0 ? (
          <p className="agenda-side-empty">Nenhum horário livre neste dia.</p>
        ) : (
          <ul className="agenda-side-list">
            {freeSlots.map((slot) => (
              <li key={slot.key}>
                <button
                  type="button"
                  className="agenda-side-list-item"
                  disabled={!canWrite || !onBookSlot}
                  onClick={() => {
                    onBookSlot?.(slot.staffId, slot.hour);
                    setPanel(null);
                  }}
                >
                  <strong>{slot.label}</strong>
                  <span>{slot.staffName}</span>
                  {canWrite ? <em>Agendar</em> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={panel === "appointments"}
        onClose={() => setPanel(null)}
        title={`Lista de agendamentos · ${data.date.split("-").reverse().join("/")}`}
        size="md"
      >
        {dayAppointments.length === 0 ? (
          <p className="agenda-side-empty">Nenhum agendamento neste dia.</p>
        ) : (
          <ul className="agenda-side-list">
            {dayAppointments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="agenda-side-list-item"
                  onClick={() => {
                    onOpenAppointment(a);
                    setPanel(null);
                  }}
                >
                  <strong>
                    {formatTimeSp(a.startsAt)} – {formatTimeSp(a.endsAt)}
                  </strong>
                  <span>
                    {shortPersonName(a.clientName)}
                    {a.status === "blocked" ? " · Bloqueio" : null}
                    {a.serviceName ? ` · ${a.serviceName}` : null}
                  </span>
                  <em>{staffName(data.staff, a.staffId)}</em>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </aside>
  );
}
