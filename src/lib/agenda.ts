import { hourInSp, minuteInSp } from "./datetime";

export type AgendaAppointment = {
  id: string;
  staffId: string | null;
  clientId?: string | null;
  clientName: string;
  serviceId?: string | null;
  serviceName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  isEncaixe: boolean;
  notes?: string | null;
  priceCents?: number | null;
};

/** Agrupa slots por profissional e slot de 30 min (grade da agenda). */
export function groupAppointmentsByStaffHour(
  appointments: AgendaAppointment[],
  staffId: string,
  hourLabel: string
): AgendaAppointment[] {
  const [hRaw, mRaw] = hourLabel.split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw ?? 0) === 30 ? 30 : 0;
  return appointments.filter((a) => {
    if (a.staffId !== staffId) return false;
    if (a.status === "cancelled") return false;
    if (hourInSp(a.startsAt) !== hour) return false;
    const bucket = minuteInSp(a.startsAt) >= 30 ? 30 : 0;
    return bucket === minute;
  });
}
