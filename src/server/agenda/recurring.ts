import { and, eq, gte, isNull, lte, inArray, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { rangesOverlap } from "./utils";

export type RecurringPeriodicity =
  | "weekly"
  | "quinzenal"
  | "every_2_weeks"
  | "every_3_weeks"
  | "monthly";

export type RecurringSlotResult = {
  date: string;
  ok: boolean;
  id?: string;
  reason?: string;
};

export type RecurringSeriesResult =
  | { ok: true; seriesId: string; slots: RecurringSlotResult[]; warning?: string }
  | { ok: false; error: string };

const PERIODS = new Set<RecurringPeriodicity>([
  "weekly",
  "quinzenal",
  "every_2_weeks",
  "every_3_weeks",
  "monthly",
]);

const ACTIVE_CONFLICT = ["scheduled", "confirmed", "arrived", "in_progress", "blocked"] as const;

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day)).toISOString().slice(0, 10);
}

function occurrenceDate(start: string, index: number, periodicity: RecurringPeriodicity): string {
  if (periodicity === "monthly") return addMonthsYmd(start, index);
  const step =
    periodicity === "quinzenal" ? 15 : periodicity === "every_2_weeks" ? 14 : periodicity === "every_3_weeks" ? 21 : 7;
  return addDaysYmd(start, index * step);
}

function weekdayOf(ymd: string): number {
  const label = new Date(`${ymd}T12:00:00-03:00`).toLocaleDateString("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });
  return WEEKDAY[label] ?? 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function covers(startTime: string, endTime: string, startHm: string, endHm: string): boolean {
  return startHm >= startTime.slice(0, 5) && endHm <= endTime.slice(0, 5);
}

export async function listSeriesDates(tenantId: string, seriesId: string) {
  const db = createDb();
  return db
    .select({
      id: schema.appointments.id,
      startsAt: schema.appointments.startsAt,
      status: schema.appointments.status,
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, tenantId),
        isNull(schema.appointments.deletedAt),
        sql`${schema.appointments.meta}->>'seriesId' = ${seriesId}`
      )
    )
    .orderBy(schema.appointments.startsAt)
    .limit(24);
}

export async function listSeriesForAppointment(tenantId: string, appointmentId: string) {
  const db = createDb();
  const [row] = await db
    .select({ meta: schema.appointments.meta })
    .from(schema.appointments)
    .where(
      and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.tenantId, tenantId))
    )
    .limit(1);
  const meta = (row?.meta ?? {}) as Record<string, unknown>;
  const seriesId = typeof meta.seriesId === "string" ? meta.seriesId : "";
  if (!seriesId) return [];
  return listSeriesDates(tenantId, seriesId);
}

export async function scheduleRecurringSeries(raw: {
  staffId: string;
  date: string;
  hour: number;
  minute?: number;
  durationMin: number;
  clientId?: string;
  serviceId?: string;
  notes?: string;
  periodicity: string;
  quantity: number;
}): Promise<RecurringSeriesResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "appointments.write");
    const tenant = await requireTenantContext();

    if (!raw.staffId) throw new AppError("VALIDATION", "Profissional obrigatório");
    if (!raw.clientId) throw new AppError("VALIDATION", "Cliente obrigatório");
    if (!raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
      throw new AppError("VALIDATION", "Data inválida");
    }
    if (!PERIODS.has(raw.periodicity as RecurringPeriodicity)) {
      throw new AppError("VALIDATION", "Periodicidade inválida");
    }
    const quantity = Math.round(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 24) {
      throw new AppError("VALIDATION", "Quantidade de 1 a 24");
    }
    const minute = raw.minute ?? 0;
    if (!Number.isInteger(minute) || minute < 0 || minute > 55 || minute % 5 !== 0) {
      throw new AppError("VALIDATION", "Minuto inválido (use de 5 em 5)");
    }
    if (raw.hour < 6 || raw.hour > 22) {
      throw new AppError("VALIDATION", "Horário fora do expediente");
    }
    const durationMin = raw.durationMin || 30;
    if (durationMin < 5 || durationMin > 480) {
      throw new AppError("VALIDATION", "Duração inválida");
    }

    const periodicity = raw.periodicity as RecurringPeriodicity;
    const db = createDb();

    const [staff] = await db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.id, raw.staffId),
          eq(schema.staff.tenantId, tenant.id),
          eq(schema.staff.isActive, true),
          eq(schema.staff.isBookable, true),
          isNull(schema.staff.deletedAt)
        )
      )
      .limit(1);
    if (!staff) throw new AppError("VALIDATION", "Profissional inválido");

    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.id, raw.clientId),
          eq(schema.clients.tenantId, tenant.id),
          isNull(schema.clients.deletedAt)
        )
      )
      .limit(1);
    if (!client) throw new AppError("VALIDATION", "Cliente inválido");

    let priceCents: number | null = null;
    if (raw.serviceId) {
      const [svc] = await db
        .select({ priceCents: schema.services.priceCents })
        .from(schema.services)
        .where(
          and(
            eq(schema.services.id, raw.serviceId),
            eq(schema.services.tenantId, tenant.id),
            isNull(schema.services.deletedAt)
          )
        )
        .limit(1);
      if (!svc) throw new AppError("VALIDATION", "Serviço inválido");
      priceCents = svc.priceCents;
    }

    const schedules = await db
      .select({
        weekday: schema.staffSchedules.weekday,
        startTime: schema.staffSchedules.startTime,
        endTime: schema.staffSchedules.endTime,
      })
      .from(schema.staffSchedules)
      .where(
        and(
          eq(schema.staffSchedules.tenantId, tenant.id),
          eq(schema.staffSchedules.staffId, raw.staffId),
          eq(schema.staffSchedules.isActive, true)
        )
      );
    const hasSchedule = schedules.length > 0;

    const dates = Array.from({ length: quantity }, (_, i) => occurrenceDate(raw.date, i, periodicity));
    const startHm = `${pad(raw.hour)}:${pad(minute)}`;
    const endMinutes = raw.hour * 60 + minute + durationMin;
    const endHm = `${pad(Math.floor(endMinutes / 60) % 24)}:${pad(endMinutes % 60)}`;

    const windowStart = new Date(`${dates[0]}T00:00:00-03:00`);
    const windowEnd = new Date(`${dates[dates.length - 1]}T23:59:59-03:00`);
    const existing = await db
      .select({
        startsAt: schema.appointments.startsAt,
        endsAt: schema.appointments.endsAt,
      })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.tenantId, tenant.id),
          eq(schema.appointments.staffId, raw.staffId),
          isNull(schema.appointments.deletedAt),
          inArray(schema.appointments.status, [...ACTIVE_CONFLICT]),
          gte(schema.appointments.startsAt, windowStart),
          lte(schema.appointments.startsAt, windowEnd)
        )
      );

    const seriesId = crypto.randomUUID();
    const slots: RecurringSlotResult[] = [];
    const insertedRanges: Array<{ start: Date; end: Date }> = [];

    async function insertOccurrence(index: number, date: string, start: Date, end: Date, conflict?: string) {
      const note = [raw.notes?.trim(), conflict].filter(Boolean).join(" · ") || null;
      const [row] = await db
        .insert(schema.appointments)
        .values({
          tenantId: tenant.id,
          staffId: raw.staffId,
          clientId: raw.clientId,
          serviceId: raw.serviceId || null,
          startsAt: start,
          endsAt: end,
          status: "scheduled",
          source: "painel",
          priceCents,
          notes: note,
          meta: {
            seriesId,
            seriesIndex: index + 1,
            seriesTotal: quantity,
            ...(conflict ? { seriesConflict: conflict } : {}),
          },
        })
        .returning({ id: schema.appointments.id });
      insertedRanges.push({ start, end });
      return row.id;
    }

    for (let index = 0; index < dates.length; index++) {
      const date = dates[index];
      const start = new Date(`${date}T${startHm}:00-03:00`);
      const end = new Date(start.getTime() + durationMin * 60_000);

      let conflict: string | undefined;
      if (hasSchedule) {
        const day = schedules.filter((s) => s.weekday === weekdayOf(date));
        if (day.length === 0) conflict = "sem jornada";
        else if (!day.some((s) => covers(String(s.startTime), String(s.endTime), startHm, endHm))) {
          conflict = "fora do horário";
        }
      }

      const busy =
        existing.some((row) => rangesOverlap(start, end, row.startsAt, row.endsAt)) ||
        insertedRanges.some((row) => rangesOverlap(start, end, row.start, row.end));
      if (busy) {
        slots.push({ date, ok: false, reason: "horário ocupado" });
        continue;
      }

      const id = await insertOccurrence(index, date, start, end, conflict);
      if (conflict) slots.push({ date, ok: false, id, reason: conflict });
      else slots.push({ date, ok: true, id });
    }

    return {
      ok: true,
      seriesId,
      slots,
      warning: hasSchedule
        ? undefined
        : "Este profissional não tem jornada cadastrada. Os dias entraram verdes. Cadastre o turno para o dia de folga ficar vermelho.",
    };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    console.error("[scheduleRecurringSeries]", err);
    return { ok: false, error: "Não foi possível criar a série" };
  }
}
