import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, rangesOverlap, slotRangeSp } from "@/server/agenda/utils";

const ACTIVE = ["scheduled", "confirmed", "arrived", "in_progress", "blocked"] as const;

export type FreeSlot = {
  date: string;
  hour: number;
  label: string;
  staffId: string;
  staffName: string;
  startsAt: string;
};

/** Próxima ocorrência do dia da semana em America/Sao_Paulo (0=dom … 6=sáb). */
export function nextDateForWeekday(weekday: number, from = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  for (let i = 0; i < 8; i += 1) {
    const d = new Date(from.getTime() + i * 86_400_000);
    const wd = map[weekdayFmt.format(d)] ?? d.getDay();
    if (i === 0 && wd === weekday) {
      // se já passou das 18h SP, pula pra próxima semana
      const hourSp = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Sao_Paulo",
          hour: "numeric",
          hour12: false,
        }).format(d)
      );
      if (hourSp >= 18) continue;
    }
    if (wd === weekday) return fmt.format(d);
  }
  return fmt.format(from);
}

export function resolveDateFromHint(dayHint: string | null): string | null {
  if (!dayHint) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (dayHint === "hoje") return fmt.format(new Date());
  if (dayHint === "amanhã") {
    return fmt.format(new Date(Date.now() + 86_400_000));
  }
  const map: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    terça: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sábado: 6,
  };
  const wd = map[dayHint];
  if (wd === undefined) return null;
  return nextDateForWeekday(wd);
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export async function listFreeSlotsForTenant(input: {
  tenantId: string;
  date: string;
  durationMin: number;
  period?: "manha" | "tarde" | null;
  limit?: number;
}): Promise<FreeSlot[]> {
  const db = createDb();
  const { start, end } = dayBoundsSp(input.date);
  const weekday = new Date(`${input.date}T12:00:00-03:00`).getDay();

  const staffRows = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
    })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, input.tenantId),
        eq(schema.staff.isActive, true),
        eq(schema.staff.isBookable, true),
        isNull(schema.staff.deletedAt)
      )
    )
    .orderBy(asc(schema.staff.name));

  if (!staffRows.length) return [];

  const schedules = await db
    .select({
      staffId: schema.staffSchedules.staffId,
      startTime: schema.staffSchedules.startTime,
      endTime: schema.staffSchedules.endTime,
    })
    .from(schema.staffSchedules)
    .where(
      and(
        eq(schema.staffSchedules.tenantId, input.tenantId),
        eq(schema.staffSchedules.weekday, weekday),
        eq(schema.staffSchedules.isActive, true)
      )
    );

  const appts = await db
    .select({
      staffId: schema.appointments.staffId,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        gte(schema.appointments.startsAt, start),
        lte(schema.appointments.startsAt, end),
        isNull(schema.appointments.deletedAt),
        inArray(schema.appointments.status, [...ACTIVE])
      )
    );

  const periodStart = input.period === "tarde" ? 13 : input.period === "manha" ? 8 : 8;
  const periodEnd = input.period === "manha" ? 12 : input.period === "tarde" ? 20 : 20;

  const slots: FreeSlot[] = [];
  const limit = input.limit ?? 6;

  for (const st of staffRows) {
    const staffSched = schedules.filter((s) => s.staffId === st.id);
    const windows =
      staffSched.length > 0
        ? staffSched.map((s) => ({
            startMin: parseTimeToMinutes(String(s.startTime).slice(0, 5)),
            endMin: parseTimeToMinutes(String(s.endTime).slice(0, 5)),
          }))
        : [{ startMin: 9 * 60, endMin: 19 * 60 }];

    for (const win of windows) {
      const fromH = Math.max(periodStart, Math.ceil(win.startMin / 60));
      const toH = Math.min(periodEnd, Math.floor((win.endMin - input.durationMin) / 60));
      for (let hour = fromH; hour <= toH; hour += 1) {
        if (hour < 8 || hour > 20) continue;
        const { start: slotStart, end: slotEnd } = slotRangeSp(
          input.date,
          hour,
          input.durationMin
        );
        const busy = appts.some(
          (a) =>
            a.staffId === st.id &&
            rangesOverlap(slotStart, slotEnd, a.startsAt, a.endsAt)
        );
        if (busy) continue;
        slots.push({
          date: input.date,
          hour,
          label: `${String(hour).padStart(2, "0")}:00`,
          staffId: st.id,
          staffName: st.name,
          startsAt: slotStart.toISOString(),
        });
        if (slots.length >= limit * 3) break;
      }
    }
  }

  // Diversifica: até `limit` slots, preferindo horários distintos
  const picked: FreeSlot[] = [];
  const usedHours = new Set<number>();
  for (const s of slots.sort((a, b) => a.hour - b.hour || a.staffName.localeCompare(b.staffName))) {
    if (usedHours.has(s.hour) && picked.length >= Math.min(3, limit)) continue;
    picked.push(s);
    usedHours.add(s.hour);
    if (picked.length >= limit) break;
  }
  return picked;
}

export async function bookAppointmentForAgent(input: {
  tenantId: string;
  clientId: string;
  staffId: string;
  serviceId?: string | null;
  date: string;
  hour: number;
  durationMin: number;
  priceCents?: number | null;
  notes?: string;
}): Promise<{ ok: true; id: string; startsAt: Date; endsAt: Date } | { ok: false; error: string }> {
  const db = createDb();
  const { start, end } = slotRangeSp(input.date, input.hour, input.durationMin);

  const [staff] = await db
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.id, input.staffId),
        eq(schema.staff.tenantId, input.tenantId),
        eq(schema.staff.isBookable, true),
        isNull(schema.staff.deletedAt)
      )
    )
    .limit(1);
  if (!staff) return { ok: false, error: "Profissional inválido" };

  const existing = await db
    .select({
      id: schema.appointments.id,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.staffId, input.staffId),
        isNull(schema.appointments.deletedAt),
        inArray(schema.appointments.status, [...ACTIVE])
      )
    );

  for (const row of existing) {
    if (rangesOverlap(start, end, row.startsAt, row.endsAt)) {
      return { ok: false, error: "Horário acabou de ser ocupado" };
    }
  }

  const [row] = await db
    .insert(schema.appointments)
    .values({
      tenantId: input.tenantId,
      staffId: input.staffId,
      clientId: input.clientId,
      serviceId: input.serviceId || null,
      startsAt: start,
      endsAt: end,
      status: "scheduled",
      source: "whatsapp_ai",
      priceCents: input.priceCents ?? null,
      notes: input.notes?.trim() || "Agendado pela Donna (WhatsApp)",
    })
    .returning({ id: schema.appointments.id });

  return { ok: true, id: row.id, startsAt: start, endsAt: end };
}

export async function cancelAppointmentForAgent(input: {
  tenantId: string;
  appointmentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createDb();
  const [row] = await db
    .update(schema.appointments)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.appointments.id, input.appointmentId),
        eq(schema.appointments.tenantId, input.tenantId),
        isNull(schema.appointments.deletedAt),
        ne(schema.appointments.status, "cancelled")
      )
    )
    .returning({ id: schema.appointments.id });
  if (!row) return { ok: false, error: "Agendamento não encontrado" };
  return { ok: true };
}
