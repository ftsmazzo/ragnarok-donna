import { dayBoundsSp, hourInSp } from "@/lib/datetime";
import type { AgendaAppointment } from "./types";

export function buildAgendaHours(appointments: AgendaAppointment[]): string[] {
  let minH = 8;
  let maxH = 20;

  for (const a of appointments) {
    const startH = hourInSp(a.startsAt);
    const endH = hourInSp(a.endsAt);
    if (startH < minH) minH = Math.max(6, startH);
    if (endH > maxH) maxH = Math.min(22, endH);
  }

  const hours: string[] = [];
  for (let h = minH; h <= maxH; h++) {
    hours.push(`${String(h).padStart(2, "0")}:00`);
  }
  return hours;
}

export function groupAppointmentsByStaffHour(
  appointments: AgendaAppointment[],
  staffId: string,
  hourLabel: string
): AgendaAppointment[] {
  const hour = Number(hourLabel.slice(0, 2));
  return appointments.filter((a) => {
    if (a.staffId !== staffId) return false;
    if (a.status === "cancelled") return false;
    return hourInSp(a.startsAt) === hour;
  });
}

/** Horário de slot a partir de YYYY-MM-DD + hora cheia (SP). */
export function slotRangeSp(date: string, hour: number, durationMin: number) {
  const start = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00-03:00`);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start, end };
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export { dayBoundsSp };
