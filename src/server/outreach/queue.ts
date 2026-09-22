import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { deliverWhatsAppText, getConnectionForTenant } from "@/server/agent/outbound";
import { dayBoundsSp, todaySp } from "@/lib/datetime";
import {
  OUTREACH_OPERATIONAL_KINDS,
  type OutreachKind,
} from "./defaults";
import {
  isOutreachPlanningEnabled,
  shouldSendOutreachLive,
} from "./kill-switch";
import {
  isInsideSendWindowSp,
  isQuietHoursSp,
  OUTREACH_HOURLY_CAP,
  OUTREACH_TICK_BATCH,
  pacingDelayMs,
  pickPriorityKind,
  sleep,
} from "./pacing";
import { getOutreachSettingsForTenant } from "./settings";

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
        sql`${schema.outreachJobs.status} in ('pending','sending','sent','dry_run')`
      )
    )
    .limit(1);
  return Boolean(row);
}

/** Máx. 1 outreach automático / telefone / 24h (exceto kinds operacionais). */
export async function hasRecentAutoOutreach(input: {
  tenantId: string;
  phoneE164: string;
  kind: OutreachKind;
}): Promise<boolean> {
  if (OUTREACH_OPERATIONAL_KINDS.includes(input.kind)) return false;
  const db = createDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ id: schema.outreachJobs.id })
    .from(schema.outreachJobs)
    .where(
      and(
        eq(schema.outreachJobs.tenantId, input.tenantId),
        eq(schema.outreachJobs.phoneE164, input.phoneE164),
        sql`${schema.outreachJobs.status} in ('pending','sending','sent','dry_run')`,
        gte(schema.outreachJobs.createdAt, since),
        ne(schema.outreachJobs.kind, "voce_vem"),
        ne(schema.outreachJobs.kind, "delay_reschedule")
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
  /** Se omitido, carrega settings do tenant. */
  dryRunEnabled?: boolean;
}): Promise<{ id: string; created: boolean }> {
  const settings =
    input.dryRunEnabled === undefined
      ? await getOutreachSettingsForTenant(input.tenantId)
      : null;
  const dryRun = input.dryRunEnabled ?? settings?.dryRunEnabled ?? true;

  if (!isOutreachPlanningEnabled(dryRun)) {
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

  if (
    await hasRecentAutoOutreach({
      tenantId: input.tenantId,
      phoneE164: input.phoneE164,
      kind: input.kind,
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
        inArray(schema.outreachJobs.status, ["sent", "dry_run"]),
        gte(schema.outreachJobs.sentAt, since)
      )
    );
  return Number(row?.n ?? 0);
}

async function countSentToday(tenantId: string): Promise<number> {
  const db = createDb();
  const { start } = dayBoundsSp(todaySp());
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachJobs)
    .where(
      and(
        eq(schema.outreachJobs.tenantId, tenantId),
        inArray(schema.outreachJobs.status, ["sent", "dry_run"]),
        gte(schema.outreachJobs.sentAt, start)
      )
    );
  return Number(row?.n ?? 0);
}

export async function processPendingOutreachJobs(input: {
  tenantId: string;
  limit?: number;
}): Promise<{
  sent: number;
  dryRun: number;
  failed: number;
  skipped: number;
  kindProcessed: string | null;
  hourlyCapHit: boolean;
  dailyCapHit: boolean;
  quietHours: boolean;
  outsideWindow: boolean;
}> {
  const empty = {
    sent: 0,
    dryRun: 0,
    failed: 0,
    skipped: 0,
    kindProcessed: null as string | null,
    hourlyCapHit: false,
    dailyCapHit: false,
    quietHours: false,
    outsideWindow: false,
  };

  const settings = await getOutreachSettingsForTenant(input.tenantId);
  if (!isOutreachPlanningEnabled(settings.dryRunEnabled)) {
    return empty;
  }

  if (isQuietHoursSp()) {
    return { ...empty, quietHours: true };
  }

  if (
    !isInsideSendWindowSp(settings.confirmationSendTime) &&
    // kinds operacionais podem sair fora da janela de confirmação
    true
  ) {
    // Ainda processa voce_vem / delay se houver; senão espera janela
  }

  const db = createDb();
  const batchCap = Math.min(
    OUTREACH_TICK_BATCH,
    Math.max(1, input.limit ?? OUTREACH_TICK_BATCH)
  );
  const now = new Date();
  const live = shouldSendOutreachLive(settings.dryRunEnabled);
  const dailyCap = settings.dailyCap;

  if (live) {
    const conn = await getConnectionForTenant(input.tenantId);
    if (!conn?.instanceName || conn.status !== "connected") {
      return empty;
    }
  }

  let sentLastHour = await countSentLastHour(input.tenantId);
  let sentToday = await countSentToday(input.tenantId);

  if (sentLastHour >= OUTREACH_HOURLY_CAP) {
    return { ...empty, hourlyCapHit: true };
  }
  if (sentToday >= dailyCap) {
    return { ...empty, dailyCapHit: true };
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
    return empty;
  }

  const operational = OUTREACH_OPERATIONAL_KINDS.includes(kind);
  if (!operational && !isInsideSendWindowSp(settings.confirmationSendTime)) {
    return { ...empty, outsideWindow: true };
  }

  const remainingHour = OUTREACH_HOURLY_CAP - sentLastHour;
  const remainingDay = dailyCap - sentToday;
  const limit = Math.min(batchCap, remainingHour, remainingDay);

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
  let dryRun = 0;
  let failed = 0;
  let skipped = 0;
  let hourlyCapHit = false;
  let dailyCapHit = false;

  const conn = live ? await getConnectionForTenant(input.tenantId) : null;

  for (let i = 0; i < jobs.length; i++) {
    if (sentLastHour + sent + dryRun >= OUTREACH_HOURLY_CAP) {
      hourlyCapHit = true;
      break;
    }
    if (sentToday + sent + dryRun >= dailyCap) {
      dailyCapHit = true;
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

    if (!live) {
      await db
        .update(schema.outreachJobs)
        .set({
          status: "dry_run",
          sentAt: new Date(),
          conversationId,
          updatedAt: new Date(),
          errorMessage: null,
          meta: {
            ...(job.meta ?? {}),
            dryRun: true,
          },
        })
        .where(eq(schema.outreachJobs.id, job.id));
      dryRun += 1;
    } else {
      const result = await deliverWhatsAppText({
        tenantId: input.tenantId,
        instanceName: conn!.instanceName!,
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

      sent += 1;

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
    }

    if (i < jobs.length - 1 && sentLastHour + sent + dryRun < OUTREACH_HOURLY_CAP) {
      await sleep(pacingDelayMs());
    }
  }

  return {
    sent,
    dryRun,
    failed,
    skipped,
    kindProcessed: kind,
    hourlyCapHit,
    dailyCapHit,
    quietHours: false,
    outsideWindow: false,
  };
}

export async function listRecentOutreachSamples(tenantId: string, limit = 12) {
  const db = createDb();
  return db
    .select({
      id: schema.outreachJobs.id,
      kind: schema.outreachJobs.kind,
      status: schema.outreachJobs.status,
      phoneE164: schema.outreachJobs.phoneE164,
      body: schema.outreachJobs.body,
      sentAt: schema.outreachJobs.sentAt,
      scheduledAt: schema.outreachJobs.scheduledAt,
      meta: schema.outreachJobs.meta,
      createdAt: schema.outreachJobs.createdAt,
    })
    .from(schema.outreachJobs)
    .where(eq(schema.outreachJobs.tenantId, tenantId))
    .orderBy(desc(schema.outreachJobs.createdAt))
    .limit(limit);
}
