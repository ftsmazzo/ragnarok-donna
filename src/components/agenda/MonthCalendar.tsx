"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  formatMonthLabelSp,
  monthStartOfSp,
  parseDateSp,
  shiftMonthSp,
  todaySp,
} from "@/lib/datetime";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

type Props = {
  selectedDate: string;
  hrefForDate: (date: string) => string;
};

function buildMonthGrid(monthAnchor: string): Array<string | null> {
  const start = parseDateSp(monthStartOfSp(monthAnchor));
  const year = start.getFullYear();
  const month = start.getMonth();
  const firstWeekday = start.getDay(); // 0 = domingo
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<string | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MonthCalendar({ selectedDate, hrefForDate }: Props) {
  const today = todaySp();
  const [viewMonth, setViewMonth] = useState(() => monthStartOfSp(selectedDate));

  useEffect(() => {
    setViewMonth(monthStartOfSp(selectedDate));
  }, [selectedDate]);

  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const label = formatMonthLabelSp(viewMonth);

  return (
    <div className="month-cal">
      <div className="month-cal-nav">
        <button
          type="button"
          className="month-cal-nav-btn"
          aria-label="Mês anterior"
          onClick={() => setViewMonth((m) => monthStartOfSp(shiftMonthSp(m, -1)))}
        >
          ‹
        </button>
        <div className="month-cal-label">{label}</div>
        <button
          type="button"
          className="month-cal-nav-btn"
          aria-label="Próximo mês"
          onClick={() => setViewMonth((m) => monthStartOfSp(shiftMonthSp(m, 1)))}
        >
          ›
        </button>
      </div>

      <div className="month-cal-weekdays">
        {WEEKDAYS.map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>

      <div className="month-cal-grid">
        {cells.map((date, i) => {
          if (!date) {
            return <span key={`e-${i}`} className="month-cal-day is-empty" />;
          }
          const isSelected = date === selectedDate;
          const isToday = date === today;
          return (
            <Link
              key={date}
              href={hrefForDate(date)}
              className={`month-cal-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
              onClick={() => setViewMonth(monthStartOfSp(date))}
            >
              {Number(date.slice(8, 10))}
            </Link>
          );
        })}
      </div>

      {selectedDate !== today ? (
        <Link href={hrefForDate(today)} className="month-cal-today">
          Ir para hoje
        </Link>
      ) : null}
    </div>
  );
}
