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
import { formatPhone } from "@/lib/format";
import { freeSlotsForDay } from "@/lib/agenda-free-slots";
import { PersonAvatar } from "@/components/cadastro/PersonAvatar";

type Panel = "available" | "appointments" | null;

type Props = {
  data: AgendaDayData;
  hrefForDate: (date: string) => string;
  onOpenAppointment: (a: AgendaAppointment) => void;
  onBookSlot?: (staffId: string, hour: number, minute?: number) => void;
  canWrite?: boolean;
};

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

  const freeSlots = useMemo(() => freeSlotsForDay(data, { stepMin: 30 }), [data]);
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
                  <span className="agenda-side-client">
                    {a.status !== "blocked" ? (
                      <PersonAvatar name={a.clientName} src={a.clientAvatarUrl} size={22} />
                    ) : null}
                    <span>
                      {shortPersonName(a.clientName)}
                      {a.status === "blocked" ? " · Bloqueio" : null}
                      {a.clientPhone && formatPhone(a.clientPhone) !== "—"
                        ? ` · ${formatPhone(a.clientPhone)}`
                        : null}
                      {a.visitLabel || a.serviceName
                        ? ` · ${a.visitLabel ?? a.serviceName}`
                        : null}
                      {a.orderId ? " · comanda" : null}
                    </span>
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
