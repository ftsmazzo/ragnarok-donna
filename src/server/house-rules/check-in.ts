import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, todaySp } from "@/lib/datetime";

const CHECKIN_PHRASE =
  /\b(estou|tô|to|cheguei|ja cheguei|já cheguei)\s+(na|aqui|na\s+frente)?\s*(barbearia|loja|sal[aã]o)?\b|\bcheguei\b|\bt[oô]\s+aqui\b|\bestou\s+aqui\b/i;

export function isCheckInPhrase(text: string): boolean {
  const t = text.trim();
  if (t.length > 80) return false;
  if (/lista|espera|remarcar|cancel|hor[aá]rio|agendar|marcar/.test(t)) return false;
  return CHECKIN_PHRASE.test(t) || /^(cheguei|to aqui|tô aqui|estou aqui)\.?[!]*$/i.test(t);
}

/**
 * Cliente com horário hoje (scheduled/confirmed) diz que chegou → status arrived.
 */
export async function tryCheckInFromWhatsApp(input: {
  tenantId: string;
  phoneE164: string;
  conversationId: string;
}): Promise<{ checkedIn: boolean; appointmentId?: string }> {
  const db = createDb();
  const today = todaySp();
  const { start, end } = dayBoundsSp(today);

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

  if (!client) return { checkedIn: false };

  const candidates = await db
    .select({
      id: schema.appointments.id,
      status: schema.appointments.status,
      meta: schema.appointments.meta,
      startsAt: schema.appointments.startsAt,
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.clientId, client.id),
        inArray(schema.appointments.status, ["scheduled", "confirmed"]),
        isNull(schema.appointments.deletedAt),
        gte(schema.appointments.startsAt, start),
        lte(schema.appointments.startsAt, end)
      )
    )
    .orderBy(schema.appointments.startsAt)
    .limit(5);

  const appt = candidates[0];
  if (!appt) return { checkedIn: false };

  const now = new Date();
  await db
    .update(schema.appointments)
    .set({
      status: "arrived",
      updatedAt: now,
      meta: {
        ...(appt.meta ?? {}),
        arrivedViaWhatsAppAt: now.toISOString(),
        checkInPhrase: true,
      },
    })
    .where(
      and(
        eq(schema.appointments.id, appt.id),
        eq(schema.appointments.tenantId, input.tenantId),
        inArray(schema.appointments.status, ["scheduled", "confirmed"])
      )
    );

  await db.insert(schema.messages).values({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    direction: "system",
    body: "Cliente fez check-in pelo WhatsApp (está na barbearia).",
    meta: { kind: "check_in", appointmentId: appt.id },
  });

  return { checkedIn: true, appointmentId: appt.id };
}

/** Tem horário hoje? (para orquestrador não tratar como encaixe) */
export async function clientHasAppointmentToday(input: {
  tenantId: string;
  phoneE164: string;
}): Promise<boolean> {
  const db = createDb();
  const { start, end } = dayBoundsSp(todaySp());
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
  if (!client) return false;

  const [row] = await db
    .select({ id: schema.appointments.id })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.clientId, client.id),
        inArray(schema.appointments.status, [
          "scheduled",
          "confirmed",
          "arrived",
          "in_progress",
        ]),
        isNull(schema.appointments.deletedAt),
        gte(schema.appointments.startsAt, start),
        lte(schema.appointments.startsAt, end)
      )
    )
    .limit(1);

  return Boolean(row);
}
