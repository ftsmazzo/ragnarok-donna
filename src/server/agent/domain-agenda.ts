import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { todaySp } from "@/lib/datetime";
import { dayBoundsSp, rangesOverlap, slotRangeSp } from "@/server/agenda/utils";
import { isLunchTimeHm } from "@/server/house-rules/defaults";
import { resolveTemporalPhrase } from "./temporal";

const ACTIVE = ["scheduled", "confirmed", "arrived", "in_progress", "blocked"] as const;

export type FreeSlot = {
  date: string;
  hour: number;
  minute: number;
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
  return resolveTemporalPhrase(dayHint)?.date ?? null;
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
  /** Se informado, só esse profissional — evita falso "agenda cheia" por diversificação. */
  staffId?: string | null;
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
        isNull(schema.staff.deletedAt),
        input.staffId ? eq(schema.staff.id, input.staffId) : undefined
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
        eq(schema.staffSchedules.isActive, true),
        input.staffId ? eq(schema.staffSchedules.staffId, input.staffId) : undefined
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
        inArray(schema.appointments.status, [...ACTIVE]),
        input.staffId ? eq(schema.appointments.staffId, input.staffId) : undefined
      )
    );

  const periodStart = input.period === "tarde" ? 13 : input.period === "manha" ? 8 : 8;
  const periodEnd = input.period === "manha" ? 12 : input.period === "tarde" ? 20 : 20;

  const slots: FreeSlot[] = [];
  const limit = input.limit ?? 6;
  const singleStaff = Boolean(input.staffId);

  for (const st of staffRows) {
    const staffSched = schedules.filter((s) => s.staffId === st.id);
    // Sem jornada naquele weekday = não trabalha (não inventar 9–19).
    if (staffSched.length === 0) continue;

    const windows = staffSched.map((s) => ({
      startMin: parseTimeToMinutes(String(s.startTime).slice(0, 5)),
      endMin: parseTimeToMinutes(String(s.endTime).slice(0, 5)),
    }));

    for (const win of windows) {
      const fromMin = Math.max(periodStart * 60, win.startMin);
      const toMin = Math.min(periodEnd * 60, win.endMin - input.durationMin);
      for (let startMin = fromMin; startMin <= toMin; startMin += 30) {
        const hour = Math.floor(startMin / 60);
        const minute = startMin % 60;
        if (hour < 8 || hour > 20) continue;
        if (minute !== 0 && minute !== 30) continue;
        const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        // Fase 4: não oferecer slots no almoço (12h–14h)
        if (isLunchTimeHm(hm)) continue;
        const { start: slotStart, end: slotEnd } = slotRangeSp(
          input.date,
          hour,
          input.durationMin,
          minute
        );
        // Hoje: não oferece horário que já passou (próximo livre real).
        if (input.date === todaySp() && slotStart.getTime() < Date.now() - 30_000) {
          continue;
        }
        const busy = appts.some(
          (a) =>
            a.staffId === st.id &&
            rangesOverlap(slotStart, slotEnd, a.startsAt, a.endsAt)
        );
        if (busy) continue;
        slots.push({
          date: input.date,
          hour,
          minute,
          label: hm,
          staffId: st.id,
          staffName: st.name,
          startsAt: slotStart.toISOString(),
        });
        if (singleStaff && slots.length >= limit) break;
        if (!singleStaff && slots.length >= limit * 3) break;
      }
      if (singleStaff && slots.length >= limit) break;
    }
    if (singleStaff && slots.length >= limit) break;
  }

  if (singleStaff) {
    return slots
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
      .slice(0, limit);
  }

  // Diversifica entre profissionais: até `limit` slots, preferindo horários distintos
  const picked: FreeSlot[] = [];
  const usedStarts = new Set<number>();
  for (const s of slots.sort(
    (a, b) =>
      a.hour * 60 + a.minute - (b.hour * 60 + b.minute) ||
      a.staffName.localeCompare(b.staffName)
  )) {
    const key = s.hour * 60 + s.minute;
    if (usedStarts.has(key) && picked.length >= Math.min(3, limit)) continue;
    picked.push(s);
    usedStarts.add(key);
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
  minute?: number;
  durationMin: number;
  priceCents?: number | null;
  notes?: string;
}): Promise<{ ok: true; id: string; startsAt: Date; endsAt: Date } | { ok: false; error: string }> {
  const db = createDb();
  const minute = input.minute === 30 ? 30 : 0;
  const { start, end } = slotRangeSp(input.date, input.hour, input.durationMin, minute);

  const [staff] = await db
    .select({ id: schema.staff.id, branchId: schema.staff.branchId })
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
      branchId: staff.branchId,
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

/**
 * Remarcação atômica: cancela o antigo e cria o novo na mesma transação.
 * Se o book falhar, o cancel é revertido (cliente não fica sem horário).
 */
export async function rescheduleAppointmentForAgent(input: {
  tenantId: string;
  appointmentId: string;
  staffId: string;
  serviceId?: string | null;
  date: string;
  hour: number;
  minute?: number;
  durationMin: number;
  priceCents?: number | null;
  notes?: string;
}): Promise<
  | { ok: true; id: string; startsAt: Date; endsAt: Date; cancelledId: string }
  | { ok: false; error: string }
> {
  const db = createDb();
  const minute = input.minute === 30 ? 30 : 0;
  const { start, end } = slotRangeSp(input.date, input.hour, input.durationMin, minute);

  try {
    const result = await db.transaction(async (tx) => {
      const [old] = await tx
        .select({
          id: schema.appointments.id,
          clientId: schema.appointments.clientId,
          serviceId: schema.appointments.serviceId,
          priceCents: schema.appointments.priceCents,
          status: schema.appointments.status,
        })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.id, input.appointmentId),
            eq(schema.appointments.tenantId, input.tenantId),
            isNull(schema.appointments.deletedAt)
          )
        )
        .limit(1);

      if (!old) throw new Error("Agendamento não encontrado");
      if (old.status === "cancelled") throw new Error("Agendamento já cancelado");
      if (!old.clientId) throw new Error("Agendamento sem cliente");

      const [staff] = await tx
        .select({ id: schema.staff.id, branchId: schema.staff.branchId })
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
      if (!staff) throw new Error("Profissional inválido");

      await tx
        .update(schema.appointments)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(schema.appointments.id, old.id),
            eq(schema.appointments.tenantId, input.tenantId)
          )
        );

      const existing = await tx
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
          throw new Error("Horário acabou de ser ocupado");
        }
      }

      const serviceId = input.serviceId !== undefined ? input.serviceId : old.serviceId;
      const [row] = await tx
        .insert(schema.appointments)
        .values({
          tenantId: input.tenantId,
          branchId: staff.branchId,
          staffId: input.staffId,
          clientId: old.clientId,
          serviceId: serviceId || null,
          startsAt: start,
          endsAt: end,
          status: "scheduled",
          source: "whatsapp_ai",
          priceCents: input.priceCents ?? old.priceCents ?? null,
          notes:
            input.notes?.trim() ||
            `Remarcado pela Donna (WhatsApp) — anterior ${old.id.slice(0, 8)}`,
        })
        .returning({ id: schema.appointments.id });

      return { id: row.id, cancelledId: old.id, startsAt: start, endsAt: end };
    });

    return { ok: true, ...result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg || "Falha ao remarcar" };
  }
}
