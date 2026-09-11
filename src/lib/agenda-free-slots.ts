import type { AgendaAppointment, AgendaDayData } from "@/server/agenda/types";
import { todaySp } from "@/lib/datetime";

export type AgendaFreeSlot = {
  key: string;
  staffId: string;
  staffName: string;
  /** Minutos desde 00:00 (ex.: 15:30 → 930). */
  startMin: number;
  hour: number;
  minute: number;
  label: string;
};

export type StaffFreeSummary = {
  staffId: string;
  staffName: string;
  slots: AgendaFreeSlot[];
  labels: string[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function labelFromMin(startMin: number): string {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${pad2(m)}`;
}

function slotBounds(date: string, startMin: number, durationMin: number) {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  const start = new Date(`${date}T${pad2(h)}:${pad2(m)}:00-03:00`);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start, end };
}

function overlaps(
  a: AgendaAppointment,
  date: string,
  startMin: number,
  durationMin: number
): boolean {
  const { start, end } = slotBounds(date, startMin, durationMin);
  return a.startsAt < end && a.endsAt > start;
}

/**
 * Horários livres do dia.
 * @param stepMin 60 = grade da sidebar; 30 = pensamento rápido (15h / 15h30).
 */
export function freeSlotsForDay(
  data: AgendaDayData,
  opts?: { stepMin?: number; fromNow?: boolean }
): AgendaFreeSlot[] {
  const stepMin = opts?.stepMin ?? 60;
  const fromNow = opts?.fromNow ?? false;
  const active = data.appointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show"
  );

  const hourNums = data.hours
    .map((h) => Number(h.slice(0, 2)))
    .filter((n) => Number.isFinite(n));
  if (!hourNums.length || !data.staff.length) return [];

  const dayStartMin = Math.min(...hourNums) * 60;
  const dayEndMin = (Math.max(...hourNums) + 1) * 60;
  const now = Date.now();
  const isToday = data.date === todaySp();

  const out: AgendaFreeSlot[] = [];
  for (const s of data.staff) {
    for (let startMin = dayStartMin; startMin + stepMin <= dayEndMin; startMin += stepMin) {
      const { start } = slotBounds(data.date, startMin, stepMin);
      if (fromNow && isToday && start.getTime() < now - 30_000) continue;

      const busy = active.some(
        (a) => a.staffId === s.id && overlaps(a, data.date, startMin, stepMin)
      );
      if (busy) continue;

      const hour = Math.floor(startMin / 60);
      const minute = startMin % 60;
      out.push({
        key: `${s.id}-${startMin}`,
        staffId: s.id,
        staffName: s.name,
        startMin,
        hour,
        minute,
        label: labelFromMin(startMin),
      });
    }
  }
  return out;
}

/** Agrupa livres por profissional (ordem da grade). */
export function groupFreeSlotsByStaff(
  data: AgendaDayData,
  slots: AgendaFreeSlot[]
): StaffFreeSummary[] {
  const byId = new Map<string, AgendaFreeSlot[]>();
  for (const slot of slots) {
    const list = byId.get(slot.staffId) ?? [];
    list.push(slot);
    byId.set(slot.staffId, list);
  }

  return data.staff
    .map((s) => {
      const list = byId.get(s.id) ?? [];
      return {
        staffId: s.id,
        staffName: s.name,
        slots: list,
        labels: list.map((x) => x.label),
      };
    })
    .filter((row) => row.slots.length > 0);
}
