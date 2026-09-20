import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "../context/tenant";
import { CRM_STAGES, readCrmPreferences } from "@/lib/crm";
import { listCrmFrequency } from "./frequency";
import { listSubscriptions } from "../subscriptions/mutations";

export type CrmDashboard = {
  funnelInProgress: number;
  leads: number;
  newThisWeek: number;
  dueReturns: number;
  lateSubscriptions: number;
  activeSubscriptions: number;
  stageCounts: { stage: string; label: string; count: number }[];
  newThisWeekRows: {
    id: string;
    name: string;
    phone: string | null;
    howHeard: string | null;
    crmStage: string;
    createdAt: Date;
  }[];
  dueSample: {
    id: string;
    name: string;
    phone: string | null;
    daysSince: number | null;
    label: string;
  }[];
};

export async function getCrmDashboard(): Promise<CrmDashboard> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [recentClients, allActive, due, subs] = await Promise.all([
    db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        phone: schema.clients.phone,
        preferences: schema.clients.preferences,
        createdAt: schema.clients.createdAt,
      })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.tenantId, tenant.id),
          isNull(schema.clients.deletedAt),
          eq(schema.clients.isActive, true),
          gte(schema.clients.createdAt, weekAgo)
        )
      )
      .orderBy(desc(schema.clients.createdAt))
      .limit(40),
    db
      .select({
        id: schema.clients.id,
        preferences: schema.clients.preferences,
      })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.tenantId, tenant.id),
          isNull(schema.clients.deletedAt),
          eq(schema.clients.isActive, true)
        )
      )
      .limit(3000),
    listCrmFrequency({ filter: "due", limit: 8 }),
    listSubscriptions({ status: "all", limit: 200 }),
  ]);

  const stageCountsMap: Record<string, number> = {};
  for (const s of CRM_STAGES) stageCountsMap[s.value] = 0;

  let funnelInProgress = 0;
  let leads = 0;

  for (const row of allActive) {
    const crm = readCrmPreferences(row.preferences);
    if (crm.crmStatus === "lead") leads += 1;
    if (crm.crmExit) continue;
    if (crm.crmStage && stageCountsMap[crm.crmStage] != null) {
      stageCountsMap[crm.crmStage] += 1;
      funnelInProgress += 1;
    }
  }

  const lateSubscriptions = subs.filter((s) => s.status === "late").length;
  const activeSubscriptions = subs.filter((s) => s.status === "active").length;

  return {
    funnelInProgress,
    leads,
    newThisWeek: recentClients.length,
    dueReturns: due.counts.due ?? due.rows.length,
    lateSubscriptions,
    activeSubscriptions,
    stageCounts: CRM_STAGES.map((s) => ({
      stage: s.value,
      label: s.label,
      count: stageCountsMap[s.value] ?? 0,
    })),
    newThisWeekRows: recentClients.map((r) => {
      const crm = readCrmPreferences(r.preferences);
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        howHeard: crm.howHeard ?? null,
        crmStage: crm.crmStage ?? "",
        createdAt: r.createdAt,
      };
    }),
    dueSample: due.rows.slice(0, 8).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      daysSince: r.daysSince,
      label: r.label,
    })),
  };
}
