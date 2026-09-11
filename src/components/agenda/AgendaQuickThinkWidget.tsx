"use client";

import { useMemo, useState } from "react";
import type { AgendaDayData } from "@/server/agenda/types";
import {
  freeSlotsForDay,
  groupFreeSlotsByStaff,
  type AgendaFreeSlot,
} from "@/lib/agenda-free-slots";
import { shortPersonName, todaySp } from "@/lib/datetime";

type Props = {
  data: AgendaDayData;
  canWrite?: boolean;
  onBookSlot?: (staffId: string, hour: number, minute?: number) => void;
};

/** Canto da tela: “Luciano hoje: 15h, 15h30”. */
export function AgendaQuickThinkWidget({ data, canWrite = false, onBookSlot }: Props) {
  const [open, setOpen] = useState(true);

  const summaries = useMemo(() => {
    const slots = freeSlotsForDay(data, { stepMin: 30, fromNow: data.date === todaySp() });
    return groupFreeSlotsByStaff(data, slots);
  }, [data]);

  const total = summaries.reduce((n, s) => n + s.slots.length, 0);
  if (total === 0) return null;

  function book(slot: AgendaFreeSlot) {
    if (!canWrite || !onBookSlot) return;
    onBookSlot(slot.staffId, slot.hour, slot.minute);
  }

  return (
    <div className={`agenda-quick-think${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="agenda-quick-think-tab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Pensamento rápido
        <span className="agenda-quick-think-count">{total}</span>
      </button>

      {open ? (
        <div className="agenda-quick-think-body">
          <p className="agenda-quick-think-lead">
            Horários livres · {data.date === todaySp() ? "hoje" : data.date.split("-").reverse().join("/")}
          </p>
          <ul className="agenda-quick-think-list">
            {summaries.map((row) => (
              <li key={row.staffId}>
                <strong>{shortPersonName(row.staffName)}</strong>
                <div className="agenda-quick-think-chips">
                  {row.slots.slice(0, 8).map((slot) => (
                    <button
                      key={slot.key}
                      type="button"
                      className="agenda-quick-think-chip"
                      disabled={!canWrite || !onBookSlot}
                      onClick={() => book(slot)}
                      title={
                        canWrite
                          ? `Agendar ${slot.label} com ${row.staffName}`
                          : slot.label
                      }
                    >
                      {slot.label}
                    </button>
                  ))}
                  {row.slots.length > 8 ? (
                    <span className="agenda-quick-think-more">+{row.slots.length - 8}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
