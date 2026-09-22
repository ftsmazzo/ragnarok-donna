import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "../context/tenant";
import { operationalAmountCents } from "./situation";

export type FcmMonth = {
  month: string; // YYYY-MM
  forecastIn: number;
  forecastOut: number;
  budgetIn: number;
  budgetOut: number;
  actualIn: number;
  actualOut: number;
};

export type FcdDay = {
  day: string;
  inCents: number;
  outCents: number;
  balanceCents: number;
};

export type DreLine = {
  group1: string;
  group2: string;
  amountCents: number;
};

/** FCM 12 meses — previsto × budget × realizado. */
export async function reportFcm(input: {
  year: number;
  branchId?: string;
}): Promise<FcmMonth[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const from = `${input.year}-01-01`;
  const to = `${input.year}-12-31`;

  const conds = [
    eq(schema.financeEntries.tenantId, tenant.id),
    isNull(schema.financeEntries.deletedAt),
    gte(schema.financeEntries.dueDate, from),
    lte(schema.financeEntries.dueDate, to),
  ];
  if (input.branchId) conds.push(eq(schema.financeEntries.branchId, input.branchId));

  const rows = await db
    .select({
      dueDate: schema.financeEntries.dueDate,
      direction: schema.financeEntries.direction,
      forecastCents: schema.financeEntries.forecastCents,
      budgetCents: schema.financeEntries.budgetCents,
      actualCents: schema.financeEntries.actualCents,
      settledAt: schema.financeEntries.settledAt,
    })
    .from(schema.financeEntries)
    .where(and(...conds));

  const months: FcmMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${input.year}-${String(m).padStart(2, "0")}`;
    months.push({
      month: key,
      forecastIn: 0,
      forecastOut: 0,
      budgetIn: 0,
      budgetOut: 0,
      actualIn: 0,
      actualOut: 0,
    });
  }

  for (const r of rows) {
    if (!r.dueDate) continue;
    const key = r.dueDate.slice(0, 7);
    const bucket = months.find((x) => x.month === key);
    if (!bucket) continue;
    const isIn = r.direction === "credit";
    const f = r.forecastCents ?? 0;
    const b = r.budgetCents ?? 0;
    const a = r.actualCents ?? (r.settledAt ? operationalAmountCents(r) : 0);
    if (isIn) {
      bucket.forecastIn += f;
      bucket.budgetIn += b;
      bucket.actualIn += a;
    } else {
      bucket.forecastOut += f;
      bucket.budgetOut += b;
      bucket.actualOut += a;
    }
  }
  return months;
}

/** FCD diário do mês. */
export async function reportFcd(input: {
  year: number;
  month: number;
  mode?: "due" | "settled";
  branchId?: string;
}): Promise<{ days: FcdDay[]; openingCents: number }> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const ym = `${input.year}-${String(input.month).padStart(2, "0")}`;
  const from = `${ym}-01`;
  const lastDay = new Date(input.year, input.month, 0).getDate();
  const to = `${ym}-${String(lastDay).padStart(2, "0")}`;
  const mode = input.mode ?? "due";

  const banks = await db
    .select({ opening: schema.bankAccounts.openingBalanceCents })
    .from(schema.bankAccounts)
    .where(
      and(eq(schema.bankAccounts.tenantId, tenant.id), isNull(schema.bankAccounts.deletedAt))
    );
  const openingCents = banks.reduce((s, b) => s + (b.opening ?? 0), 0);

  const conds = [
    eq(schema.financeEntries.tenantId, tenant.id),
    isNull(schema.financeEntries.deletedAt),
  ];
  if (input.branchId) conds.push(eq(schema.financeEntries.branchId, input.branchId));

  const rows = await db
    .select()
    .from(schema.financeEntries)
    .where(and(...conds));

  const byDay = new Map<string, { inCents: number; outCents: number }>();
  for (let d = 1; d <= lastDay; d++) {
    byDay.set(`${ym}-${String(d).padStart(2, "0")}`, { inCents: 0, outCents: 0 });
  }

  for (const r of rows) {
    const day =
      mode === "settled"
        ? r.settledAt
          ? r.settledAt.toISOString().slice(0, 10)
          : null
        : r.dueDate;
    if (!day || day < from || day > to) continue;
    const bucket = byDay.get(day);
    if (!bucket) continue;
    const amt = operationalAmountCents(r);
    if (r.direction === "credit") bucket.inCents += amt;
    else bucket.outCents += amt;
  }

  let running = openingCents;
  const days: FcdDay[] = [];
  for (const [day, v] of [...byDay.entries()].sort()) {
    running += v.inCents - v.outCents;
    days.push({ day, inCents: v.inCents, outCents: v.outCents, balanceCents: running });
  }
  return { days, openingCents };
}

/** DRE por competência (issueDate). */
export async function reportDre(input: {
  from: string;
  to: string;
  branchId?: string;
}): Promise<{ lines: DreLine[]; totalRevenue: number; totalExpense: number }> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const conds = [
    eq(schema.financeEntries.tenantId, tenant.id),
    isNull(schema.financeEntries.deletedAt),
    gte(schema.financeEntries.issueDate, input.from),
    lte(schema.financeEntries.issueDate, input.to),
  ];
  if (input.branchId) conds.push(eq(schema.financeEntries.branchId, input.branchId));

  const rows = await db
    .select({
      direction: schema.financeEntries.direction,
      forecastCents: schema.financeEntries.forecastCents,
      budgetCents: schema.financeEntries.budgetCents,
      actualCents: schema.financeEntries.actualCents,
      settledAt: schema.financeEntries.settledAt,
      dreGroup1: schema.chartAccounts.dreGroup1,
      dreGroup2: schema.chartAccounts.dreGroup2,
    })
    .from(schema.financeEntries)
    .leftJoin(
      schema.chartAccounts,
      eq(schema.financeEntries.chartAccountId, schema.chartAccounts.id)
    )
    .where(and(...conds));

  const map = new Map<string, DreLine>();
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const r of rows) {
    const amt = operationalAmountCents(r);
    const g1 = r.dreGroup1 || (r.direction === "credit" ? "RECEITAS" : "DESPESAS");
    const g2 = r.dreGroup2 || "Outros";
    const key = `${g1}||${g2}`;
    const signed = r.direction === "credit" ? amt : -amt;
    const cur = map.get(key) ?? { group1: g1, group2: g2, amountCents: 0 };
    cur.amountCents += signed;
    map.set(key, cur);
    if (r.direction === "credit") totalRevenue += amt;
    else totalExpense += amt;
  }

  return {
    lines: [...map.values()].sort((a, b) =>
      a.group1 === b.group1 ? a.group2.localeCompare(b.group2) : a.group1.localeCompare(b.group1)
    ),
    totalRevenue,
    totalExpense,
  };
}
