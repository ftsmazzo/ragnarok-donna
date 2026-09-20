import { and, desc, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "../context/tenant";
import { CRM_STAGES, readCrmPreferences } from "@/lib/crm";

export type CrmPipelineRow = {
  id: string;
  name: string;
  phone: string | null;
  crmStatus: string;
  crmStage: string;
  howHeard: string | null;
  campaign: string | null;
  crmExit: string | null;
  updatedAt: Date;
};

export type CrmPipelineResult = {
  stage: string | "all" | "exited";
  rows: CrmPipelineRow[];
  counts: Record<string, number>;
};

export async function listCrmPipeline(opts?: {
  stage?: string;
  limit?: number;
  /** Só quem tem etapa / saída / lead — evita dump de 2k clientes. */
  funnelOnly?: boolean;
}): Promise<CrmPipelineResult> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const stageFilter = (opts?.stage ?? "all").trim();
  const funnelOnly = opts?.funnelOnly !== false;

  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      preferences: schema.clients.preferences,
      updatedAt: schema.clients.updatedAt,
    })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        isNull(schema.clients.deletedAt),
        eq(schema.clients.isActive, true)
      )
    )
    .orderBy(desc(schema.clients.updatedAt))
    .limit(3000);

  let mapped: CrmPipelineRow[] = rows.map((r) => {
    const crm = readCrmPreferences(r.preferences);
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      crmStatus: crm.crmStatus ?? "client",
      crmStage: crm.crmStage ?? "",
      howHeard: crm.howHeard ?? null,
      campaign: crm.campaign ?? null,
      crmExit: crm.crmExit ?? null,
      updatedAt: r.updatedAt,
    };
  });

  if (funnelOnly) {
    mapped = mapped.filter(
      (r) =>
        Boolean(r.crmStage) ||
        Boolean(r.crmExit) ||
        r.crmStatus === "lead" ||
        Boolean(r.howHeard)
    );
  }

  const counts: Record<string, number> = {
    all: mapped.filter((r) => !r.crmExit).length,
    exited: 0,
    unstaged: 0,
  };
  for (const s of CRM_STAGES) counts[s.value] = 0;
  for (const row of mapped) {
    if (row.crmExit) {
      counts.exited += 1;
      continue;
    }
    if (row.crmStage && counts[row.crmStage] != null) counts[row.crmStage] += 1;
    else counts.unstaged += 1;
  }

  let filtered = mapped;
  if (stageFilter === "exited") {
    filtered = mapped.filter((r) => Boolean(r.crmExit));
  } else if (stageFilter === "unstaged") {
    filtered = mapped.filter((r) => !r.crmExit && !r.crmStage);
  } else if (stageFilter !== "all" && stageFilter) {
    filtered = mapped.filter((r) => r.crmStage === stageFilter && !r.crmExit);
  } else {
    filtered = mapped.filter((r) => !r.crmExit);
  }

  return {
    stage: stageFilter,
    rows: filtered.slice(0, limit),
    counts,
  };
}
