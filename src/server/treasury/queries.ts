import { and, asc, desc, eq, gte, isNull, lte, or, sql, ilike } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { computeSituation, operationalAmountCents } from "./situation";
import type {
  ApArFilter,
  BankAccountRow,
  ChartAccountRow,
  CreditCardRow,
  FinanceEntryRow,
  FinanceSituation,
  TreasuryPaymentMethodRow,
  TreasuryPermissions,
} from "./types";

export async function getTreasuryPermissions(): Promise<TreasuryPermissions> {
  const session = await requireSession();
  return { canWrite: hasCapability(session.role, "finance.treasury") };
}

function toDateStr(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function mapEntry(
  row: {
    id: string;
    direction: "credit" | "debit";
    description: string;
    partyName: string | null;
    chartAccountId: string | null;
    bankAccountId: string | null;
    treasuryPaymentMethodId: string | null;
    creditCardId: string | null;
    cardInvoiceId: string | null;
    costCenter: string | null;
    docType: string | null;
    docNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    settledAt: Date | null;
    forecastCents: number | null;
    budgetCents: number | null;
    actualCents: number | null;
    installmentIndex: number | null;
    installmentTotal: number | null;
    recurrence: FinanceEntryRow["recurrence"];
    isForecastOnly: boolean;
    reconciledAt: Date | null;
    branchId: string | null;
    notes: string | null;
    chartCode?: string | null;
    chartName?: string | null;
    bankName?: string | null;
    pmName?: string | null;
  }
): FinanceEntryRow {
  const issueDate = toDateStr(row.issueDate);
  const dueDate = toDateStr(row.dueDate);
  return {
    id: row.id,
    direction: row.direction,
    description: row.description,
    partyName: row.partyName,
    chartAccountId: row.chartAccountId,
    chartAccountCode: row.chartCode ?? null,
    chartAccountName: row.chartName ?? null,
    bankAccountId: row.bankAccountId,
    bankAccountName: row.bankName ?? null,
    treasuryPaymentMethodId: row.treasuryPaymentMethodId,
    paymentMethodName: row.pmName ?? null,
    creditCardId: row.creditCardId,
    cardInvoiceId: row.cardInvoiceId,
    costCenter: row.costCenter,
    docType: row.docType,
    docNumber: row.docNumber,
    issueDate,
    dueDate,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    forecastCents: row.forecastCents,
    budgetCents: row.budgetCents,
    actualCents: row.actualCents,
    amountCents: operationalAmountCents(row),
    installmentIndex: row.installmentIndex,
    installmentTotal: row.installmentTotal,
    recurrence: row.recurrence,
    isForecastOnly: row.isForecastOnly,
    reconciledAt: row.reconciledAt ? row.reconciledAt.toISOString() : null,
    branchId: row.branchId,
    situation: computeSituation({
      dueDate,
      settledAt: row.settledAt,
      isForecastOnly: row.isForecastOnly,
      actualCents: row.actualCents,
    }),
    notes: row.notes,
  };
}

export async function listChartAccounts(opts?: {
  activeOnly?: boolean;
}): Promise<ChartAccountRow[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const conds = [
    eq(schema.chartAccounts.tenantId, tenant.id),
    isNull(schema.chartAccounts.deletedAt),
  ];
  if (opts?.activeOnly !== false) {
    conds.push(eq(schema.chartAccounts.active, true));
  }
  const rows = await db
    .select()
    .from(schema.chartAccounts)
    .where(and(...conds))
    .orderBy(asc(schema.chartAccounts.code));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    syntheticName: r.syntheticName,
    dfcGroup1: r.dfcGroup1,
    dfcGroup2: r.dfcGroup2,
    dreGroup1: r.dreGroup1,
    dreGroup2: r.dreGroup2,
    includeInFcd: r.includeInFcd,
    includeInFcm: r.includeInFcm,
    active: r.active,
  }));
}

export async function listBankAccounts(): Promise<BankAccountRow[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const rows = await db
    .select()
    .from(schema.bankAccounts)
    .where(
      and(eq(schema.bankAccounts.tenantId, tenant.id), isNull(schema.bankAccounts.deletedAt))
    )
    .orderBy(asc(schema.bankAccounts.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    institution: r.institution,
    accountType: r.accountType,
    bankCode: r.bankCode,
    openingBalanceCents: r.openingBalanceCents,
    openingBalanceDate: toDateStr(r.openingBalanceDate),
    branchId: r.branchId,
    active: r.active,
  }));
}

export async function listTreasuryPaymentMethods(): Promise<TreasuryPaymentMethodRow[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const rows = await db
    .select()
    .from(schema.treasuryPaymentMethods)
    .where(eq(schema.treasuryPaymentMethods.tenantId, tenant.id))
    .orderBy(asc(schema.treasuryPaymentMethods.sortOrder), asc(schema.treasuryPaymentMethods.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    active: r.active,
    sortOrder: r.sortOrder,
  }));
}

async function listEntriesRaw(filter: ApArFilter & { direction?: "credit" | "debit"; bankAccountId?: string; creditCardId?: string; unsettledOnly?: boolean }) {
  const tenant = await requireTenantContext();
  const db = createDb();
  const conds = [
    eq(schema.financeEntries.tenantId, tenant.id),
    isNull(schema.financeEntries.deletedAt),
  ];
  if (filter.direction) conds.push(eq(schema.financeEntries.direction, filter.direction));
  if (filter.bankAccountId) conds.push(eq(schema.financeEntries.bankAccountId, filter.bankAccountId));
  if (filter.creditCardId) conds.push(eq(schema.financeEntries.creditCardId, filter.creditCardId));
  if (filter.branchId) conds.push(eq(schema.financeEntries.branchId, filter.branchId));
  if (filter.unsettledOnly) conds.push(isNull(schema.financeEntries.settledAt));

  const dateCol =
    filter.dateField === "issue" ? schema.financeEntries.issueDate : schema.financeEntries.dueDate;
  if (filter.from) conds.push(gte(dateCol, filter.from));
  if (filter.to) conds.push(lte(dateCol, filter.to));
  if (filter.q?.trim()) {
    const q = `%${filter.q.trim()}%`;
    conds.push(
      or(
        ilike(schema.financeEntries.description, q),
        ilike(schema.financeEntries.partyName, q)
      )!
    );
  }

  const rows = await db
    .select({
      id: schema.financeEntries.id,
      direction: schema.financeEntries.direction,
      description: schema.financeEntries.description,
      partyName: schema.financeEntries.partyName,
      chartAccountId: schema.financeEntries.chartAccountId,
      bankAccountId: schema.financeEntries.bankAccountId,
      treasuryPaymentMethodId: schema.financeEntries.treasuryPaymentMethodId,
      creditCardId: schema.financeEntries.creditCardId,
      cardInvoiceId: schema.financeEntries.cardInvoiceId,
      costCenter: schema.financeEntries.costCenter,
      docType: schema.financeEntries.docType,
      docNumber: schema.financeEntries.docNumber,
      issueDate: schema.financeEntries.issueDate,
      dueDate: schema.financeEntries.dueDate,
      settledAt: schema.financeEntries.settledAt,
      forecastCents: schema.financeEntries.forecastCents,
      budgetCents: schema.financeEntries.budgetCents,
      actualCents: schema.financeEntries.actualCents,
      installmentIndex: schema.financeEntries.installmentIndex,
      installmentTotal: schema.financeEntries.installmentTotal,
      recurrence: schema.financeEntries.recurrence,
      isForecastOnly: schema.financeEntries.isForecastOnly,
      reconciledAt: schema.financeEntries.reconciledAt,
      branchId: schema.financeEntries.branchId,
      notes: schema.financeEntries.notes,
      chartCode: schema.chartAccounts.code,
      chartName: schema.chartAccounts.name,
      bankName: schema.bankAccounts.name,
      pmName: schema.treasuryPaymentMethods.name,
    })
    .from(schema.financeEntries)
    .leftJoin(
      schema.chartAccounts,
      eq(schema.financeEntries.chartAccountId, schema.chartAccounts.id)
    )
    .leftJoin(
      schema.bankAccounts,
      eq(schema.financeEntries.bankAccountId, schema.bankAccounts.id)
    )
    .leftJoin(
      schema.treasuryPaymentMethods,
      eq(schema.financeEntries.treasuryPaymentMethodId, schema.treasuryPaymentMethods.id)
    )
    .where(and(...conds))
    .orderBy(desc(schema.financeEntries.dueDate), desc(schema.financeEntries.createdAt))
    .limit(500);

  let mapped = rows.map(mapEntry);
  if (filter.situation && filter.situation !== "all_open") {
    mapped = mapped.filter((e) => e.situation === filter.situation);
  } else if (filter.situation === "all_open") {
    mapped = mapped.filter((e) => e.situation !== "settled");
  }
  return mapped;
}

export async function listPayables(filter: ApArFilter = {}): Promise<FinanceEntryRow[]> {
  return listEntriesRaw({ ...filter, direction: "debit" });
}

export async function listReceivables(filter: ApArFilter = {}): Promise<FinanceEntryRow[]> {
  return listEntriesRaw({ ...filter, direction: "credit" });
}

export async function listBankStatement(input: {
  bankAccountId: string;
  from?: string;
  to?: string;
}): Promise<{ openingBalanceCents: number; entries: FinanceEntryRow[]; balanceCents: number }> {
  const banks = await listBankAccounts();
  const bank = banks.find((b) => b.id === input.bankAccountId);
  const opening = bank?.openingBalanceCents ?? 0;
  const entries = await listEntriesRaw({
    bankAccountId: input.bankAccountId,
    from: input.from,
    to: input.to,
    dateField: "due",
  });
  let balance = opening;
  for (const e of entries) {
    if (e.situation !== "settled" && !e.actualCents) continue;
    balance += e.direction === "credit" ? e.amountCents : -e.amountCents;
  }
  return { openingBalanceCents: opening, entries, balanceCents: balance };
}

export async function listCreditCards(): Promise<CreditCardRow[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const cards = await db
    .select()
    .from(schema.creditCards)
    .where(and(eq(schema.creditCards.tenantId, tenant.id), isNull(schema.creditCards.deletedAt)))
    .orderBy(asc(schema.creditCards.name));

  const result: CreditCardRow[] = [];
  for (const c of cards) {
    const openInv = await db
      .select()
      .from(schema.cardInvoices)
      .where(
        and(
          eq(schema.cardInvoices.creditCardId, c.id),
          eq(schema.cardInvoices.status, "open")
        )
      )
      .orderBy(desc(schema.cardInvoices.dueDate))
      .limit(1);

    const inv = openInv[0] ?? null;
    let used = 0;
    if (inv) {
      const [sum] = await db
        .select({
          total: sql<number>`coalesce(sum(coalesce(${schema.financeEntries.actualCents}, ${schema.financeEntries.forecastCents}, 0)), 0)`,
        })
        .from(schema.financeEntries)
        .where(
          and(
            eq(schema.financeEntries.cardInvoiceId, inv.id),
            isNull(schema.financeEntries.deletedAt)
          )
        );
      used = Number(sum?.total ?? 0);
    } else {
      const [sum] = await db
        .select({
          total: sql<number>`coalesce(sum(coalesce(${schema.financeEntries.actualCents}, ${schema.financeEntries.forecastCents}, 0)), 0)`,
        })
        .from(schema.financeEntries)
        .where(
          and(
            eq(schema.financeEntries.creditCardId, c.id),
            isNull(schema.financeEntries.settledAt),
            isNull(schema.financeEntries.deletedAt)
          )
        );
      used = Number(sum?.total ?? 0);
    }

    result.push({
      id: c.id,
      name: c.name,
      institution: c.institution,
      limitCents: c.limitCents,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
      active: c.active,
      usedCents: used,
      availableCents: Math.max(0, c.limitCents - used),
      nextInvoiceCents: used,
      openInvoiceId: inv?.id ?? null,
    });
  }
  return result;
}

export async function getTreasuryDashboard(): Promise<{
  payablesOpenCents: number;
  receivablesOpenCents: number;
  overduePayablesCents: number;
  overdueCount: number;
  thisWeekPayablesCents: number;
}> {
  const [pay, recv] = await Promise.all([
    listPayables({ situation: "all_open" }),
    listReceivables({ situation: "all_open" }),
  ]);
  const overdue = pay.filter((e) => e.situation === "overdue");
  const week = pay.filter((e) => e.situation === "this_week");
  return {
    payablesOpenCents: pay.reduce((s, e) => s + e.amountCents, 0),
    receivablesOpenCents: recv.reduce((s, e) => s + e.amountCents, 0),
    overduePayablesCents: overdue.reduce((s, e) => s + e.amountCents, 0),
    overdueCount: overdue.length,
    thisWeekPayablesCents: week.reduce((s, e) => s + e.amountCents, 0),
  };
}

export type { FinanceSituation };
