import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { formatTimeSp, todaySp } from "@/lib/datetime";
import { delayToleranceMinutes } from "@/lib/service-tolerance";
import { enqueueOutreachJob } from "@/server/outreach/queue";
import { renderOutreachTemplate } from "@/server/outreach/templates";
import { HOUSE_RULES } from "./defaults";

const TEMPLATE_VOCE_VEM =
  "Oi {{nome}}! Seu horário era às {{hora}} com {{profissional}}. Você vem? Se atrasar muito a gente precisa remarcar.";

const TEMPLATE_REMARCAR =
  "Oi {{nome}}! Passou da tolerância do horário ({{hora}}). Vamos remarcar pra não atrapalhar a fila — responde aqui com o melhor dia/hora.";

/**
 * Fase 4 — atraso:
 * - +10 min sem check-in → “você vem?”
 * - +15/20 min → remarcação
 * Respeita OUTREACH_DISPATCH_ENABLED (kill switch).
 */
export async function planDelayAndNoShowMessages(input: {
  tenantId: string;
  tenantName: string;
}): Promise<{ voceVem: number; reschedule: number }> {
  const db = createDb();
  const now = new Date();
  const today = todaySp();

  const rows = await db
    .select({
      id: schema.appointments.id,
      startsAt: schema.appointments.startsAt,
      status: schema.appointments.status,
      meta: schema.appointments.meta,
      clientId: schema.appointments.clientId,
      clientName: schema.clients.name,
      phoneE164: schema.clients.phoneE164,
      staffName: schema.staff.name,
      serviceName: schema.services.name,
      durationMin: schema.services.durationMin,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        inArray(schema.appointments.status, ["scheduled", "confirmed"]),
        isNull(schema.appointments.deletedAt),
        isNotNull(schema.clients.phoneE164),
        lte(schema.appointments.startsAt, now),
        sql`(${schema.appointments.startsAt} AT TIME ZONE 'America/Sao_Paulo')::date = ${today}::date`
      )
    )
    .limit(80);

  let voceVem = 0;
  let reschedule = 0;

  for (const row of rows) {
    const phone = row.phoneE164?.trim();
    if (!phone || !row.clientId) continue;

    const elapsedMin = Math.floor((now.getTime() - row.startsAt.getTime()) / 60_000);
    if (elapsedMin < HOUSE_RULES.voceVemAfterMin) continue;

    const vars = {
      nome: row.clientName,
      hora: formatTimeSp(row.startsAt),
      profissional: row.staffName,
      barbearia: input.tenantName,
    };

    if (elapsedMin >= HOUSE_RULES.voceVemAfterMin && !row.meta?.voceVemSentAt) {
      const body = renderOutreachTemplate(TEMPLATE_VOCE_VEM, vars);
      const res = await enqueueOutreachJob({
        tenantId: input.tenantId,
        kind: "voce_vem",
        phoneE164: phone,
        clientId: row.clientId,
        body,
        dayKey: `vocevem:${row.id}:${today}`,
        meta: { appointmentId: row.id },
      });
      if (res.created) {
        voceVem += 1;
        await db
          .update(schema.appointments)
          .set({
            meta: { ...(row.meta ?? {}), voceVemSentAt: now.toISOString() },
            updatedAt: now,
          })
          .where(eq(schema.appointments.id, row.id));
      }
    }

    const tol = delayToleranceMinutes({
      serviceName: row.serviceName,
      durationMin: row.durationMin,
    });
    const metaAfter = row.meta ?? {};
    if (elapsedMin >= tol && !metaAfter.delayRescheduleSentAt) {
      const body = renderOutreachTemplate(TEMPLATE_REMARCAR, vars);
      const res = await enqueueOutreachJob({
        tenantId: input.tenantId,
        kind: "delay_reschedule",
        phoneE164: phone,
        clientId: row.clientId,
        body,
        dayKey: `delay:${row.id}:${today}`,
        meta: { appointmentId: row.id, toleranceMin: tol },
      });
      if (res.created) {
        reschedule += 1;
        const [fresh] = await db
          .select({ meta: schema.appointments.meta })
          .from(schema.appointments)
          .where(eq(schema.appointments.id, row.id))
          .limit(1);
        await db
          .update(schema.appointments)
          .set({
            meta: {
              ...(fresh?.meta ?? metaAfter),
              delayRescheduleSentAt: now.toISOString(),
              delayToleranceMin: tol,
            },
            updatedAt: now,
          })
          .where(eq(schema.appointments.id, row.id));
      }
    }
  }

  return { voceVem, reschedule };
}
