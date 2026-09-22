import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, todaySp } from "@/lib/datetime";
import {
  isOutreachDispatchEnabled,
  isOutreachDryRunEnv,
  isSundayBlastHardAllowed,
  shouldSendOutreachLive,
} from "./kill-switch";
import { OUTREACH_HOURLY_CAP } from "./pacing";
import { getOutreachSettingsForTenant } from "./settings";

export type OutreachMetrics = {
  dispatchEnabled: boolean;
  dryRunActive: boolean;
  sundayBlastHardAllowed: boolean;
  dailyCap: number;
  hourlyCap: number;
  sentToday: number;
  dryRunToday: number;
  failedToday: number;
  pending: number;
  sentLastHour: number;
  recentBodies: {
    id: string;
    kind: string;
    status: string;
    bodyPreview: string;
    variantIndex: number | null;
    phoneTail: string;
    at: string | null;
  }[];
};

export async function getOutreachMetrics(tenantId: string): Promise<OutreachMetrics> {
  const settings = await getOutreachSettingsForTenant(tenantId);
  const dryRunActive = !shouldSendOutreachLive(settings.dryRunEnabled);
  const db = createDb();
  const { start } = dayBoundsSp(todaySp());
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [[todayCounts], [hourCount], [pendingCount], recent] = await Promise.all([
    db
      .select({
        sent: sql<number>`count(*) filter (where ${schema.outreachJobs.status} = 'sent')::int`,
        dryRun: sql<number>`count(*) filter (where ${schema.outreachJobs.status} = 'dry_run')::int`,
        failed: sql<number>`count(*) filter (where ${schema.outreachJobs.status} = 'failed')::int`,
      })
      .from(schema.outreachJobs)
      .where(
        and(
          eq(schema.outreachJobs.tenantId, tenantId),
          gte(schema.outreachJobs.createdAt, start)
        )
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.outreachJobs)
      .where(
        and(
          eq(schema.outreachJobs.tenantId, tenantId),
          inArray(schema.outreachJobs.status, ["sent", "dry_run"]),
          gte(schema.outreachJobs.sentAt, hourAgo)
        )
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.outreachJobs)
      .where(
        and(
          eq(schema.outreachJobs.tenantId, tenantId),
          eq(schema.outreachJobs.status, "pending")
        )
      ),
    db
      .select({
        id: schema.outreachJobs.id,
        kind: schema.outreachJobs.kind,
        status: schema.outreachJobs.status,
        body: schema.outreachJobs.body,
        phoneE164: schema.outreachJobs.phoneE164,
        meta: schema.outreachJobs.meta,
        sentAt: schema.outreachJobs.sentAt,
        createdAt: schema.outreachJobs.createdAt,
      })
      .from(schema.outreachJobs)
      .where(eq(schema.outreachJobs.tenantId, tenantId))
      .orderBy(sql`${schema.outreachJobs.createdAt} desc`)
      .limit(12),
  ]);

  return {
    dispatchEnabled: isOutreachDispatchEnabled(),
    dryRunActive: dryRunActive || isOutreachDryRunEnv(),
    sundayBlastHardAllowed: isSundayBlastHardAllowed(),
    dailyCap: settings.dailyCap,
    hourlyCap: OUTREACH_HOURLY_CAP,
    sentToday: Number(todayCounts?.sent ?? 0),
    dryRunToday: Number(todayCounts?.dryRun ?? 0),
    failedToday: Number(todayCounts?.failed ?? 0),
    pending: Number(pendingCount?.n ?? 0),
    sentLastHour: Number(hourCount?.n ?? 0),
    recentBodies: recent.map((r) => {
      const variantIndex =
        typeof r.meta?.variantIndex === "number" ? r.meta.variantIndex : null;
      const phone = r.phoneE164 ?? "";
      return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        bodyPreview: r.body.slice(0, 120) + (r.body.length > 120 ? "…" : ""),
        variantIndex,
        phoneTail: phone.length > 4 ? `…${phone.slice(-4)}` : phone,
        at: (r.sentAt ?? r.createdAt)?.toISOString?.() ?? null,
      };
    }),
  };
}
