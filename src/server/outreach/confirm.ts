import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, shiftDateSp, todaySp } from "@/lib/datetime";

/**
 * Se o cliente respondeu OK a um pedido de confirmação, confirma o horário (verde).
 * Retorna true se confirmou algo (caller pode pular orquestrador).
 */
export async function tryConfirmAppointmentFromWhatsAppAck(input: {
  tenantId: string;
  phoneE164: string;
  conversationId: string;
}): Promise<{ confirmed: boolean; appointmentId?: string }> {
  const db = createDb();
  const today = todaySp();
  const tomorrow = shiftDateSp(today, 1);
  const { start: startToday } = dayBoundsSp(today);
  const { end: endTomorrow } = dayBoundsSp(tomorrow);

  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, input.tenantId),
        eq(schema.clients.phoneE164, input.phoneE164),
        isNull(schema.clients.deletedAt)
      )
    )
    .limit(1);

  if (!client) return { confirmed: false };

  const candidates = await db
    .select({
      id: schema.appointments.id,
      meta: schema.appointments.meta,
      status: schema.appointments.status,
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.clientId, client.id),
        eq(schema.appointments.status, "scheduled"),
        isNull(schema.appointments.deletedAt),
        gte(schema.appointments.startsAt, startToday),
        lte(schema.appointments.startsAt, endTomorrow),
        sql`${schema.appointments.meta}->>'confirmationRequestedAt' is not null`
      )
    )
    .orderBy(schema.appointments.startsAt)
    .limit(3);

  const appt = candidates[0];
  if (!appt) return { confirmed: false };

  const now = new Date();
  await db
    .update(schema.appointments)
    .set({
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
      meta: {
        ...(appt.meta ?? {}),
        confirmedViaWhatsAppAt: now.toISOString(),
      },
    })
    .where(
      and(
        eq(schema.appointments.id, appt.id),
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.status, "scheduled")
      )
    );

  await db.insert(schema.messages).values({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    direction: "system",
    body: "Horário confirmado pelo cliente no WhatsApp (OK).",
    meta: { kind: "confirmation_ok", appointmentId: appt.id },
  });

  return { confirmed: true, appointmentId: appt.id };
}

/** Lista confirmações recentes via Zap (para som no painel/PWA). */
export async function listRecentWhatsAppConfirmations(input: {
  tenantId: string;
  sinceIso: string;
  limit?: number;
}) {
  const db = createDb();
  const since = new Date(input.sinceIso);
  if (Number.isNaN(since.getTime())) return [];

  const rows = await db
    .select({
      id: schema.appointments.id,
      clientName: schema.clients.name,
      startsAt: schema.appointments.startsAt,
      confirmedAt: schema.appointments.confirmedAt,
      meta: schema.appointments.meta,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.status, "confirmed"),
        gte(schema.appointments.confirmedAt, since),
        sql`${schema.appointments.meta}->>'confirmedViaWhatsAppAt' is not null`
      )
    )
    .orderBy(sql`${schema.appointments.confirmedAt} desc`)
    .limit(input.limit ?? 20);

  return rows.map((r) => ({
    id: r.id,
    clientName: r.clientName ?? "Cliente",
    startsAt: r.startsAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
  }));
}
