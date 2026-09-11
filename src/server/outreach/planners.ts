import { and, eq, gte, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, formatDateLabelSp, formatTimeSp, shiftDateSp, todaySp } from "@/lib/datetime";
import { isClosedForOutreach, timeReachedSp } from "./calendar";
import type { OutreachSettingsView } from "./defaults";
import { enqueueOutreachJob } from "./queue";
import { renderOutreachTemplate } from "./templates";

export async function planConfirmationDaily(input: {
  tenantId: string;
  tenantName: string;
  settings: OutreachSettingsView;
}): Promise<{ enqueued: number; skippedClosed: boolean }> {
  if (!input.settings.confirmationEnabled) return { enqueued: 0, skippedClosed: false };

  const today = todaySp();
  if (!timeReachedSp(input.settings.confirmationSendTime)) {
    return { enqueued: 0, skippedClosed: false };
  }

  if (
    isClosedForOutreach(today, {
      skipSundays: input.settings.skipSundays,
      skipHolidays: input.settings.skipHolidays,
      customClosedDates: input.settings.customClosedDates,
    })
  ) {
    return { enqueued: 0, skippedClosed: true };
  }

  const targetDate = shiftDateSp(today, 1);
  if (
    isClosedForOutreach(targetDate, {
      skipSundays: input.settings.skipSundays,
      skipHolidays: input.settings.skipHolidays,
      customClosedDates: input.settings.customClosedDates,
    })
  ) {
    return { enqueued: 0, skippedClosed: true };
  }

  const { start, end } = dayBoundsSp(targetDate);
  const db = createDb();

  const rows = await db
    .select({
      id: schema.appointments.id,
      startsAt: schema.appointments.startsAt,
      clientId: schema.appointments.clientId,
      clientName: schema.clients.name,
      phoneE164: schema.clients.phoneE164,
      staffName: schema.staff.name,
      meta: schema.appointments.meta,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.status, "scheduled"),
        isNull(schema.appointments.deletedAt),
        gte(schema.appointments.startsAt, start),
        lte(schema.appointments.startsAt, end),
        isNotNull(schema.clients.phoneE164)
      )
    );

  let enqueued = 0;
  const dateLabel = formatDateLabelSp(targetDate);

  for (const row of rows) {
    const phone = row.phoneE164?.trim();
    if (!phone) continue;
    if (row.meta?.confirmationRequestedAt) continue;

    const body = renderOutreachTemplate(input.settings.templateConfirmation, {
      nome: row.clientName,
      data: dateLabel,
      hora: formatTimeSp(row.startsAt),
      profissional: row.staffName,
      barbearia: input.tenantName,
    });

    const res = await enqueueOutreachJob({
      tenantId: input.tenantId,
      kind: "confirmation_daily",
      phoneE164: phone,
      clientId: row.clientId,
      body,
      dayKey: `confirm:${targetDate}`,
      meta: { appointmentId: row.id, targetDate },
    });
    if (res.created) enqueued += 1;
  }

  return { enqueued, skippedClosed: false };
}

async function loadLastVisitClients(input: {
  tenantId: string;
  minLastAt: Date;
  maxLastAt: Date;
  limit?: number;
}) {
  const db = createDb();
  return db
    .select({
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      phoneE164: schema.clients.phoneE164,
      lastAt: sql<Date>`max(${schema.appointments.startsAt})`.as("last_at"),
    })
    .from(schema.clients)
    .innerJoin(
      schema.appointments,
      and(
        eq(schema.appointments.clientId, schema.clients.id),
        eq(schema.appointments.tenantId, schema.clients.tenantId)
      )
    )
    .where(
      and(
        eq(schema.clients.tenantId, input.tenantId),
        isNull(schema.clients.deletedAt),
        isNotNull(schema.clients.phoneE164),
        isNull(schema.appointments.deletedAt)
      )
    )
    .groupBy(schema.clients.id, schema.clients.name, schema.clients.phoneE164)
    .having(
      and(
        lte(sql`max(${schema.appointments.startsAt})`, input.maxLastAt),
        gte(sql`max(${schema.appointments.startsAt})`, input.minLastAt)
      )
    )
    .limit(input.limit ?? 300);
}

export async function planFollowupInactive(input: {
  tenantId: string;
  tenantName: string;
  settings: OutreachSettingsView;
}): Promise<{ enqueued30: number; enqueued60: number }> {
  const today = todaySp();
  const dayOfMonth = Number(today.slice(8, 10));
  if (!input.settings.followupMonthDays.includes(dayOfMonth)) {
    return { enqueued30: 0, enqueued60: 0 };
  }

  async function enqueueBand(
    days: number,
    enabled: boolean,
    template: string,
    band: "30" | "60"
  ) {
    if (!enabled) return 0;
    const maxLastAt = dayBoundsSp(shiftDateSp(today, -days)).end;
    const minLastAt = dayBoundsSp(shiftDateSp(today, -(days + 14))).start;
    const rows = await loadLastVisitClients({
      tenantId: input.tenantId,
      minLastAt,
      maxLastAt,
    });

    let n = 0;
    for (const row of rows) {
      const phone = row.phoneE164?.trim();
      if (!phone) continue;
      const body = renderOutreachTemplate(template, {
        nome: row.clientName,
        barbearia: input.tenantName,
      });
      const res = await enqueueOutreachJob({
        tenantId: input.tenantId,
        kind: "followup_inactive",
        phoneE164: phone,
        clientId: row.clientId,
        body,
        dayKey: `fu${band}:${today}`,
        meta: { inactiveDays: days, band },
      });
      if (res.created) n += 1;
    }
    return n;
  }

  const enqueued30 = await enqueueBand(
    input.settings.followup30Days,
    input.settings.followup30Enabled,
    input.settings.templateFollowup30,
    "30"
  );
  const enqueued60 = await enqueueBand(
    input.settings.followup60Days,
    input.settings.followup60Enabled,
    input.settings.templateFollowup60,
    "60"
  );

  return { enqueued30, enqueued60 };
}

export async function planSundayBlast(input: {
  tenantId: string;
  tenantName: string;
  settings: OutreachSettingsView;
}): Promise<{ enqueued: number }> {
  if (!input.settings.sundayBlastEnabled) return { enqueued: 0 };
  const today = todaySp();
  const wd = new Date(`${today}T12:00:00-03:00`).toLocaleDateString("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });
  if (wd !== "Sun") return { enqueued: 0 };
  if (!timeReachedSp(input.settings.confirmationSendTime)) return { enqueued: 0 };

  const minLastAt = dayBoundsSp(shiftDateSp(today, -input.settings.blastActiveWithinDays)).start;
  const maxLastAt = dayBoundsSp(today).end;
  const rows = await loadLastVisitClients({
    tenantId: input.tenantId,
    minLastAt,
    maxLastAt,
    limit: 400,
  });

  let enqueued = 0;
  for (const row of rows) {
    const phone = row.phoneE164?.trim();
    if (!phone) continue;
    const body = renderOutreachTemplate(input.settings.templateSundayBlast, {
      nome: row.clientName,
      barbearia: input.tenantName,
    });
    const res = await enqueueOutreachJob({
      tenantId: input.tenantId,
      kind: "sunday_blast",
      phoneE164: phone,
      clientId: row.clientId,
      body,
      dayKey: `blast:${today}`,
    });
    if (res.created) enqueued += 1;
  }
  return { enqueued };
}

export async function planEmptyAgenda(input: {
  tenantId: string;
  tenantName: string;
  settings: OutreachSettingsView;
}): Promise<{ enqueued: number }> {
  if (!input.settings.emptyAgendaEnabled) return { enqueued: 0 };
  if (!timeReachedSp(input.settings.confirmationSendTime)) return { enqueued: 0 };

  const today = todaySp();
  const targetDate = shiftDateSp(today, 1);
  if (
    isClosedForOutreach(targetDate, {
      skipSundays: input.settings.skipSundays,
      skipHolidays: input.settings.skipHolidays,
      customClosedDates: input.settings.customClosedDates,
    })
  ) {
    return { enqueued: 0 };
  }

  const { start, end } = dayBoundsSp(targetDate);
  const db = createDb();

  const staffRows = await db
    .select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, input.tenantId),
        eq(schema.staff.isActive, true),
        isNull(schema.staff.deletedAt)
      )
    );

  let enqueued = 0;
  const since = dayBoundsSp(shiftDateSp(today, -180)).start;

  for (const st of staffRows) {
    const [busy] = await db
      .select({ id: schema.appointments.id })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.tenantId, input.tenantId),
          eq(schema.appointments.staffId, st.id),
          isNull(schema.appointments.deletedAt),
          gte(schema.appointments.startsAt, start),
          lte(schema.appointments.startsAt, end),
          ne(schema.appointments.status, "cancelled"),
          ne(schema.appointments.status, "blocked")
        )
      )
      .limit(1);

    if (busy) continue;

    const clients = await db
      .select({
        clientId: schema.clients.id,
        clientName: schema.clients.name,
        phoneE164: schema.clients.phoneE164,
        lastAt: sql<Date>`max(${schema.appointments.startsAt})`.as("last_at"),
      })
      .from(schema.clients)
      .innerJoin(
        schema.appointments,
        and(
          eq(schema.appointments.clientId, schema.clients.id),
          eq(schema.appointments.tenantId, schema.clients.tenantId)
        )
      )
      .where(
        and(
          eq(schema.clients.tenantId, input.tenantId),
          eq(schema.appointments.staffId, st.id),
          isNull(schema.clients.deletedAt),
          isNotNull(schema.clients.phoneE164),
          isNull(schema.appointments.deletedAt),
          gte(schema.appointments.startsAt, since)
        )
      )
      .groupBy(schema.clients.id, schema.clients.name, schema.clients.phoneE164)
      .orderBy(sql`max(${schema.appointments.startsAt}) desc`)
      .limit(40);

    for (const row of clients) {
      const phone = row.phoneE164?.trim();
      if (!phone) continue;
      const body = renderOutreachTemplate(input.settings.templateEmptyAgenda, {
        nome: row.clientName,
        profissional: st.name,
        barbearia: input.tenantName,
        data: formatDateLabelSp(targetDate),
      });
      const res = await enqueueOutreachJob({
        tenantId: input.tenantId,
        kind: "empty_agenda",
        phoneE164: phone,
        clientId: row.clientId,
        body,
        dayKey: `empty:${st.id}:${targetDate}`,
        meta: { staffId: st.id, targetDate },
      });
      if (res.created) enqueued += 1;
    }
  }

  return { enqueued };
}
