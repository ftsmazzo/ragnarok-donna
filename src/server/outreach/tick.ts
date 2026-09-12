import { eq, inArray } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { planDelayAndNoShowMessages } from "@/server/house-rules/delay-planner";
import { isOutreachDispatchEnabled } from "./kill-switch";
import { getOutreachSettingsForTenant } from "./settings";
import { processPendingOutreachJobs } from "./queue";
import {
  planConfirmationDaily,
  planEmptyAgenda,
  planFollowupInactive,
  planSundayBlast,
} from "./planners";

export type OutreachTickResult = {
  tenantId: string;
  slug: string;
  planned: {
    confirmation: number;
    followup30: number;
    followup60: number;
    sundayBlast: number;
    emptyAgenda: number;
    voceVem: number;
    delayReschedule: number;
  };
  processed: { sent: number; failed: number; skipped: number };
  skippedReason?: string;
};

export async function runOutreachTick(opts?: {
  tenantSlug?: string | null;
  limitPerTenant?: number;
}): Promise<OutreachTickResult[]> {
  if (!isOutreachDispatchEnabled()) {
    console.info("[outreach] tick ignorado — OUTREACH_DISPATCH_ENABLED off");
    return [];
  }

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
    const delay = await planDelayAndNoShowMessages({
      tenantId: tenant.id,
      tenantName: tenant.name,
    });

    const processed = await processPendingOutreachJobs({
      tenantId: tenant.id,
      limit: opts?.limitPerTenant ?? 25,
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
        voceVem: delay.voceVem,
        delayReschedule: delay.reschedule,
      },
      processed,
    });
  }

  return results;
}
