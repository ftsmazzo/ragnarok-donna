import { and, eq, gte, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { deliverWhatsAppText, getConnectionForTenant } from "@/server/agent/outbound";
import type { OutreachKind } from "./defaults";
import { isOutreachDispatchEnabled } from "./kill-switch";
import {
  OUTREACH_HOURLY_CAP,
  OUTREACH_TICK_BATCH,
  pacingDelayMs,
  pickPriorityKind,
  sleep,
} from "./pacing";

export async function ensureConversationForPhone(input: {
  tenantId: string;
  phoneE164: string;
  clientId?: string | null;
}): Promise<string> {
  const db = createDb();
  const [existing] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.tenantId, input.tenantId),
        eq(schema.conversations.phoneE164, input.phoneE164)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.conversations)
    .values({
      tenantId: input.tenantId,
      phoneE164: input.phoneE164,
      clientId: input.clientId ?? null,
      mode: "ai",
    })
    .returning({ id: schema.conversations.id });
  return created.id;
}

/** Evita duplicar mesmo kind+telefone+dayKey. */
export async function hasOutreachDedupe(input: {
  tenantId: string;
  kind: OutreachKind;
  phoneE164: string;
  dayKey: string;
}): Promise<boolean> {
  const db = createDb();
  const [row] = await db
    .select({ id: schema.outreachJobs.id })
    .from(schema.outreachJobs)
    .where(
      and(
        eq(schema.outreachJobs.tenantId, input.tenantId),
        eq(schema.outreachJobs.kind, input.kind),
        eq(schema.outreachJobs.phoneE164, input.phoneE164),
        sql`${schema.outreachJobs.meta}->>'dayKey' = ${input.dayKey}`,
        sql`${schema.outreachJobs.status} in ('pending','sending','sent')`
      )
    )
    .limit(1);
  return Boolean(row);
}

export async function enqueueOutreachJob(input: {
  tenantId: string;
  kind: OutreachKind;
  phoneE164: string;
  body: string;
  clientId?: string | null;
  conversationId?: string | null;
  scheduledAt?: Date;
  meta?: Record<string, unknown>;
  dayKey: string;
}): Promise<{ id: string; created: boolean }> {
  if (!isOutreachDispatchEnabled()) {
    return { id: "", created: false };
  }

  if (
    await hasOutreachDedupe({
      tenantId: input.tenantId,
      kind: input.kind,
      phoneE164: input.phoneE164,
      dayKey: input.dayKey,
    })
  ) {
    return { id: "", created: false };
  }

  const db = createDb();
  const conversationId =
    input.conversationId ??
    (await ensureConversationForPhone({
      tenantId: input.tenantId,
      phoneE164: input.phoneE164,
      clientId: input.clientId,
    }));

  const [row] = await db
    .insert(schema.outreachJobs)
    .values({
      tenantId: input.tenantId,
      clientId: input.clientId ?? null,
      conversationId,
      phoneE164: input.phoneE164,
      kind: input.kind,
      body: input.body,
      status: "pending",
      scheduledAt: input.scheduledAt ?? new Date(),
      meta: { ...(input.meta ?? {}), dayKey: input.dayKey },
    })
    .returning({ id: schema.outreachJobs.id });

  return { id: row.id, created: true };
}

async function countSentLastHour(tenantId: string): Promise<number> {
  const db = createDb();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachJobs)
    .where(
      and(
        eq(schema.outreachJobs.tenantId, tenantId),
        eq(schema.outreachJobs.status, "sent"),
        gte(schema.outreachJobs.sentAt, since)
      )
    );
  return Number(row?.n ?? 0);
}

export async function processPendingOutreachJobs(input: {
  tenantId: string;
  limit?: number;
}): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  kindProcessed: string | null;
  hourlyCapHit: boolean;
}> {
  if (!isOutreachDispatchEnabled()) {
    return { sent: 0, failed: 0, skipped: 0, kindProcessed: null, hourlyCapHit: false };
  }

  const db = createDb();
  const batchCap = Math.min(
    OUTREACH_TICK_BATCH,
    Math.max(1, input.limit ?? OUTREACH_TICK_BATCH)
  );
  const now = new Date();

  const conn = await getConnectionForTenant(input.tenantId);
  if (!conn?.instanceName || conn.status !== "connected") {
    return { sent: 0, failed: 0, skipped: 0, kindProcessed: null, hourlyCapHit: false };
  }

  let sentLastHour = await countSentLastHour(input.tenantId);
  if (sentLastHour >= OUTREACH_HOURLY_CAP) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      kindProcessed: null,
      hourlyCapHit: true,
    };
  }

  const pendingKinds = await db
    .selectDistinct({ kind: schema.outreachJobs.kind })
    .from(schema.outreachJobs)
    .where(
      and(
        eq(schema.outreachJobs.tenantId, input.tenantId),
        eq(schema.outreachJobs.status, "pending"),
        lte(schema.outreachJobs.scheduledAt, now)
      )
    );

  const kind = pickPriorityKind(pendingKinds.map((r) => r.kind));
  if (!kind) {
    return { sent: 0, failed: 0, skipped: 0, kindProcessed: null, hourlyCapHit: false };
  }

  const remainingCap = OUTREACH_HOURLY_CAP - sentLastHour;
  const limit = Math.min(batchCap, remainingCap);

  const jobs = await db
    .select()
    .from(schema.outreachJobs)
    .where(
      and(
        eq(schema.outreachJobs.tenantId, input.tenantId),
        eq(schema.outreachJobs.status, "pending"),
        eq(schema.outreachJobs.kind, kind),
        lte(schema.outreachJobs.scheduledAt, now)
      )
    )
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let hourlyCapHit = false;

  for (let i = 0; i < jobs.length; i++) {
    if (sentLastHour + sent >= OUTREACH_HOURLY_CAP) {
      hourlyCapHit = true;
      break;
    }

    const job = jobs[i];
    const claimed = await db
      .update(schema.outreachJobs)
      .set({ status: "sending", updatedAt: new Date() })
      .where(
        and(eq(schema.outreachJobs.id, job.id), eq(schema.outreachJobs.status, "pending"))
      )
      .returning({ id: schema.outreachJobs.id });

    if (!claimed.length) {
      skipped += 1;
      continue;
    }

    const conversationId =
      job.conversationId ??
      (await ensureConversationForPhone({
        tenantId: input.tenantId,
        phoneE164: job.phoneE164,
        clientId: job.clientId,
      }));

    const result = await deliverWhatsAppText({
      tenantId: input.tenantId,
      instanceName: conn.instanceName,
      phoneE164: job.phoneE164,
      text: job.body,
      conversationId,
      direction: "outbound_ai",
    });

    if (!result.ok) {
      await db
        .update(schema.outreachJobs)
        .set({
          status: "failed",
          errorMessage: result.error.slice(0, 400),
          updatedAt: new Date(),
        })
        .where(eq(schema.outreachJobs.id, job.id));
      failed += 1;
      continue;
    }

    await db
      .update(schema.outreachJobs)
      .set({
        status: "sent",
        sentAt: new Date(),
        conversationId,
        updatedAt: new Date(),
        errorMessage: null,
        meta: {
          ...(job.meta ?? {}),
          waMessageId: result.waMessageId ?? null,
          deliveryStatus: result.waMessageId ? "sent" : "pending",
        },
      })
      .where(eq(schema.outreachJobs.id, job.id));

    const appointmentId =
      typeof job.meta?.appointmentId === "string" ? job.meta.appointmentId : null;
    if (job.kind === "confirmation_daily" && appointmentId) {
      const [appt] = await db
        .select({ id: schema.appointments.id, meta: schema.appointments.meta })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.id, appointmentId),
            eq(schema.appointments.tenantId, input.tenantId)
          )
        )
        .limit(1);
      if (appt) {
        await db
          .update(schema.appointments)
          .set({
            meta: {
              ...(appt.meta ?? {}),
              confirmationRequestedAt: new Date().toISOString(),
              confirmationJobId: job.id,
            },
            updatedAt: new Date(),
          })
          .where(eq(schema.appointments.id, appt.id));
      }
    }

    sent += 1;

    // Pacing: espera antes do próximo envio (não após o último)
    if (i < jobs.length - 1 && sentLastHour + sent < OUTREACH_HOURLY_CAP) {
      await sleep(pacingDelayMs());
    }
  }

  return { sent, failed, skipped, kindProcessed: kind, hourlyCapHit };
}
