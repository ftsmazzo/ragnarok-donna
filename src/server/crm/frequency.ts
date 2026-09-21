import { sql } from "drizzle-orm";
import { createDb } from "@/db";
import { requireTenantContext } from "../context/tenant";
import {
  CRM_FREQUENCY,
  CRM_FREQUENCY_DEFAULTS,
  classifyCrmFrequency,
  visitStatsFromDates,
  type CrmFrequency,
  type CrmFrequencyResult,
} from "@/lib/crm-frequency";

export type CrmFrequencyRow = {
  id: string;
  name: string;
  phone: string | null;
  lastAt: Date | null;
  lastServiceName: string | null;
} & CrmFrequencyResult;

export type CrmFrequencyList = {
  filter: CrmFrequency | "due" | "all";
  rows: CrmFrequencyRow[];
  counts: Record<string, number>;
};

/**
 * Carrega visitas (serviço em comanda + agenda) e classifica ritmo por cliente.
 */
export async function listCrmFrequency(opts?: {
  filter?: string;
  limit?: number;
}): Promise<CrmFrequencyList> {
  try {
    return await listCrmFrequencyUnsafe(opts);
  } catch (err) {
    console.error("[listCrmFrequency]", err);
    return { filter: "due", rows: [], counts: { all: 0, due: 0 } };
  }
}

async function listCrmFrequencyUnsafe(opts?: {
  filter?: string;
  limit?: number;
}): Promise<CrmFrequencyList> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 400);
  const filterRaw = (opts?.filter ?? "due").trim();
  const filter =
    filterRaw === "all" ||
    filterRaw === "due" ||
    CRM_FREQUENCY.some((f) => f.value === filterRaw)
      ? (filterRaw as CrmFrequencyList["filter"])
      : "due";

  const windowDays = CRM_FREQUENCY_DEFAULTS.actionableWindowDays;

  const result = await db.execute(sql`
    with service_visits as (
      select
        o.client_id,
        oi.performed_at as visit_at,
        oi.description as service_name
      from order_items oi
      inner join orders o on o.id = oi.order_id
      where oi.tenant_id = ${tenant.id}
        and o.tenant_id = ${tenant.id}
        and o.client_id is not null
        and o.deleted_at is null
        and oi.item_type = 'service'
        and oi.performed_at is not null
        and oi.performed_at >= now() - interval '24 months'
    ),
    appt_visits as (
      select
        a.client_id,
        a.starts_at as visit_at,
        null::text as service_name
      from appointments a
      where a.tenant_id = ${tenant.id}
        and a.client_id is not null
        and a.deleted_at is null
        and a.status not in ('blocked', 'cancelled')
        and a.starts_at >= now() - interval '24 months'
        and a.starts_at <= now()
    ),
    all_visits as (
      select * from service_visits
      union all
      select * from appt_visits
    ),
    agg as (
      select
        client_id,
        array_agg(visit_at order by visit_at asc) as visit_dates,
        max(visit_at) as last_at,
        (
          array_agg(service_name order by visit_at desc nulls last)
          filter (where service_name is not null)
        )[1] as last_service
      from all_visits
      group by client_id
    )
    select
      c.id as client_id,
      c.name as client_name,
      c.phone,
      agg.visit_dates,
      agg.last_service
    from clients c
    inner join agg on agg.client_id = c.id
    where c.tenant_id = ${tenant.id}
      and c.deleted_at is null
      and c.is_active = true
      and agg.last_at >= now() - (${windowDays} * interval '1 day')
  `);

  const list = [...result] as unknown as {
    client_id: string;
    client_name: string;
    phone: string | null;
    visit_dates: (Date | string)[] | null;
    last_service: string | null;
  }[];

  const mapped: CrmFrequencyRow[] = list.map((r) => {
    const dates = (r.visit_dates ?? []).map((d) => new Date(d));
    const stats = visitStatsFromDates(dates);
    const classified = classifyCrmFrequency(stats);
    return {
      id: r.client_id,
      name: r.client_name ?? "Cliente",
      phone: r.phone,
      lastAt: stats.lastAt,
      lastServiceName: r.last_service,
      ...classified,
    };
  });

  const counts: Record<string, number> = {
    all: mapped.length,
    due: 0,
  };
  for (const f of CRM_FREQUENCY) counts[f.value] = 0;
  for (const row of mapped) {
    counts[row.frequency] = (counts[row.frequency] ?? 0) + 1;
    if (row.dueForReturn) counts.due += 1;
  }

  let filtered = mapped;
  if (filter === "due") {
    filtered = mapped.filter((r) => r.dueForReturn);
  } else if (filter !== "all") {
    filtered = mapped.filter((r) => r.frequency === filter);
  }

  filtered.sort((a, b) => {
    const da = a.daysSince ?? -1;
    const db_ = b.daysSince ?? -1;
    return db_ - da;
  });

  return {
    filter,
    rows: filtered.slice(0, limit),
    counts,
  };
}

export async function countCrmDueForReturn(): Promise<number> {
  const data = await listCrmFrequency({ filter: "due", limit: 400 });
  return data.counts.due ?? data.rows.length;
}
