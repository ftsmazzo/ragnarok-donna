import { and, asc, count, eq, gte, isNull, lte } from "drizzle-orm";
import { schema } from "@/db";
import { dayBoundsSp, formatDateSp, hourInSp, todaySp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";

export type AgendaStaff = {
  id: string;
  name: string;
  color: string | null;
};

export type AgendaAppointment = {
  id: string;
  staffId: string | null;
  clientName: string;
  serviceName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  isEncaixe: boolean;
};

export type AgendaDayData = {
  tenantName: string;
  date: string;
  staff: AgendaStaff[];
  appointments: AgendaAppointment[];
  hours: string[];
  waitlistCount: number;
  openOrdersCount: number;
  totalAppointments: number;
};

function buildHours(appointments: AgendaAppointment[]): string[] {
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

export async function getAgendaDay(dateStr?: string): Promise<AgendaDayData> {
  const tenant = await getDefaultTenant();
  const { date, start, end } = dayBoundsSp(dateStr);
  const db = getDb();

  const staff = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      color: schema.staff.color,
    })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, tenant.id),
        eq(schema.staff.isActive, true),
        eq(schema.staff.isBookable, true),
        isNull(schema.staff.deletedAt)
      )
    )
    .orderBy(asc(schema.staff.name));

  const rows = await db
    .select({
      id: schema.appointments.id,
      staffId: schema.appointments.staffId,
      clientName: schema.clients.name,
      serviceName: schema.services.name,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
      status: schema.appointments.status,
      isEncaixe: schema.appointments.isEncaixe,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .where(
      and(
        eq(schema.appointments.tenantId, tenant.id),
        gte(schema.appointments.startsAt, start),
        lte(schema.appointments.startsAt, end),
        isNull(schema.appointments.deletedAt)
      )
    )
    .orderBy(asc(schema.appointments.startsAt));

  const appointments: AgendaAppointment[] = rows.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    clientName: r.clientName ?? "Sem cliente",
    serviceName: r.serviceName,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    status: r.status,
    isEncaixe: r.isEncaixe,
  }));

  const [waitlistRow] = await db
    .select({ n: count() })
    .from(schema.waitlistEntries)
    .where(
      and(
        eq(schema.waitlistEntries.tenantId, tenant.id),
        eq(schema.waitlistEntries.status, "waiting")
      )
    );

  const [ordersRow] = await db
    .select({ n: count() })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        gte(schema.orders.openedAt, start),
        lte(schema.orders.openedAt, end),
        isNull(schema.orders.deletedAt)
      )
    );

  return {
    tenantName: tenant.name,
    date,
    staff,
    appointments,
    hours: buildHours(appointments),
    waitlistCount: Number(waitlistRow?.n ?? 0),
    openOrdersCount: Number(ordersRow?.n ?? 0),
    totalAppointments: appointments.length,
  };
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
