import { hourInSp } from "./datetime";

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

/** Agrupa slots por profissional e hora (grade da agenda). */
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
