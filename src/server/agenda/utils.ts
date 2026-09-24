import { dayBoundsSp, hourInSp, minuteInSp } from "@/lib/datetime";
import type { AgendaAppointment } from "./types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Grade da agenda em passos de 30 min (08:00, 08:30, …). */
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
    hours.push(`${pad2(h)}:00`);
    hours.push(`${pad2(h)}:30`);
  }
  return hours;
}

export function parseAgendaSlotLabel(hourLabel: string): { hour: number; minute: number } {
  const [hRaw, mRaw] = hourLabel.split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw ?? 0);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: minute === 30 ? 30 : 0,
  };
}

/** Agendamentos que COMEÇAM neste slot (para desenhar o card). */
export function groupAppointmentsByStaffHour(
  appointments: AgendaAppointment[],
  staffId: string,
  hourLabel: string
): AgendaAppointment[] {
  const { hour, minute } = parseAgendaSlotLabel(hourLabel);
  return appointments.filter((a) => {
    if (a.staffId !== staffId) return false;
    if (a.status === "cancelled") return false;
    if (hourInSp(a.startsAt) !== hour) return false;
    const startMin = minuteInSp(a.startsAt);
    const bucket = startMin >= 30 ? 30 : 0;
    return bucket === minute;
  });
}

/** Slot ocupado se algum atendimento/bloqueio sobrepõe a janela de 30 min. */
export function isAgendaSlotBusy(
  appointments: AgendaAppointment[],
  staffId: string,
  date: string,
  hour: number,
  minute: number
): boolean {
  const { start, end } = slotRangeSp(date, hour, 30, minute);
  return appointments.some((a) => {
    if (a.staffId !== staffId) return false;
    if (a.status === "cancelled" || a.status === "no_show") return false;
    return rangesOverlap(start, end, a.startsAt, a.endsAt);
  });
}

/** Horário de slot a partir de YYYY-MM-DD + hora/minuto (SP). */
export function slotRangeSp(
  date: string,
  hour: number,
  durationMin: number,
  minute = 0
) {
  const start = new Date(`${date}T${pad2(hour)}:${pad2(minute)}:00-03:00`);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start, end };
}

export type ScheduleWindow = { startMin: number; endMin: number };

export function parseHmToMin(t: string): number {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Cell fora de qualquer turno da jornada (início, almoço entre turnos, fim). */
export function isAgendaSlotOffHours(
  windows: ScheduleWindow[] | undefined,
  hour: number,
  minute: number
): boolean {
  if (!windows || windows.length === 0) return false;
  const startMin = hour * 60 + minute;
  return !windows.some((w) => startMin >= w.startMin && startMin < w.endMin);
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export { dayBoundsSp };
