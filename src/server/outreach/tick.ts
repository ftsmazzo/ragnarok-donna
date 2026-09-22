import { eq, inArray } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { planDelayAndNoShowMessages } from "@/server/house-rules/delay-planner";
import { isOutreachPlanningEnabled } from "./kill-switch";
import { getOutreachSettingsForTenant } from "./settings";
import { processPendingOutreachJobs } from "./queue";
import {
  planBirthday,
  planConfirmationDaily,
  planEmptyAgenda,
  planFollowupInactive,
  planSundayBlast,
} from "./planners";
import { OUTREACH_TICK_BATCH } from "./pacing";

export type OutreachTickResult = {
  tenantId: string;
  slug: string;
  planned: {
    confirmation: number;
    followup30: number;
    followup60: number;
    sundayBlast: number;
    emptyAgenda: number;
    birthday: number;
    voceVem: number;
    delayReschedule: number;
  };
  processed: {
    sent: number;
    dryRun: number;
    failed: number;
    skipped: number;
    kindProcessed: string | null;
    hourlyCapHit: boolean;
    dailyCapHit: boolean;
    quietHours: boolean;
    outsideWindow: boolean;
  };
  skippedReason?: string;
};

export async function runOutreachTick(opts?: {
  tenantSlug?: string | null;
  limitPerTenant?: number;
}): Promise<OutreachTickResult[]> {
  const db = createDb();
  let tenants: { id: string; slug: string; name: string }[];

  if (opts?.tenantSlug) {
    tenants = await db
      .select({
        id: schema.tenants.id,
        slug: schema.tenants.slug,
        name: schema.tenants.name,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, opts.tenantSlug));
  } else {
    tenants = await db
      .select({
        id: schema.tenants.id,
        slug: schema.tenants.slug,
        name: schema.tenants.name,
      })
      .from(schema.tenants)
      .where(inArray(schema.tenants.status, ["active", "trialing"]));
  }

  const results: OutreachTickResult[] = [];

  for (const tenant of tenants) {
    const settings = await getOutreachSettingsForTenant(tenant.id);

    if (!isOutreachPlanningEnabled(settings.dryRunEnabled)) {
      console.info("[outreach] tick ignorado — planning off", tenant.slug);
      results.push({
        tenantId: tenant.id,
        slug: tenant.slug,
        planned: {
          confirmation: 0,
          followup30: 0,
          followup60: 0,
          sundayBlast: 0,
          emptyAgenda: 0,
          birthday: 0,
          voceVem: 0,
          delayReschedule: 0,
        },
        processed: {
          sent: 0,
          dryRun: 0,
          failed: 0,
          skipped: 0,
          kindProcessed: null,
          hourlyCapHit: false,
          dailyCapHit: false,
          quietHours: false,
          outsideWindow: false,
        },
        skippedReason: "planning_disabled",
      });
      continue;
    }

    const confirmation = await planConfirmationDaily({
      tenantId: tenant.id,
      tenantName: tenant.name,
      settings,
    });
    const followup = await planFollowupInactive({
      tenantId: tenant.id,
      tenantName: tenant.name,
      settings,
    });
    const blast = await planSundayBlast({
      tenantId: tenant.id,
      tenantName: tenant.name,
      settings,
    });
    const empty = await planEmptyAgenda({
      tenantId: tenant.id,
      tenantName: tenant.name,
      settings,
    });
    const birthday = await planBirthday({
      tenantId: tenant.id,
      tenantName: tenant.name,
      settings,
    });
    const delay = await planDelayAndNoShowMessages({
      tenantId: tenant.id,
      tenantName: tenant.name,
    });

    const processed = await processPendingOutreachJobs({
      tenantId: tenant.id,
      limit: opts?.limitPerTenant ?? OUTREACH_TICK_BATCH,
    });

    results.push({
      tenantId: tenant.id,
      slug: tenant.slug,
      planned: {
        confirmation: confirmation.enqueued,
        followup30: followup.enqueued30,
        followup60: followup.enqueued60,
        sundayBlast: blast.enqueued,
        emptyAgenda: empty.enqueued,
        birthday: birthday.enqueued,
        voceVem: delay.voceVem,
        delayReschedule: delay.reschedule,
      },
      processed,
    });
  }

  return results;
}
