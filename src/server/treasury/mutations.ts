"use server";

import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { shiftDateSp } from "@/lib/datetime";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import type { FinanceDirection, FinanceRecurrence } from "./types";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof AppError) return { ok: false, error: err.message };
  if (err instanceof ForbiddenError) return { ok: false, error: err.message };
  return { ok: false, error: fallback };
}

async function requireTreasuryWrite() {
  const session = await requireSession();
  requireCapability(session, "finance.treasury");
  const tenant = await requireTenantContext();
  return { session, tenant };
}

export async function upsertChartAccount(input: {
  id?: string;
  code: string;
  name: string;
  syntheticName?: string;
  dfcGroup1?: string;
  dfcGroup2?: string;
  dreGroup1?: string;
  dreGroup2?: string;
  includeInFcd?: boolean;
  includeInFcm?: boolean;
  active?: boolean;
}): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) throw new AppError("VALIDATION", "Código e nome são obrigatórios");
    const db = createDb();
    const values = {
      tenantId: tenant.id,
      code,
      name,
      syntheticName: input.syntheticName?.trim() || null,
      dfcGroup1: input.dfcGroup1?.trim() || null,
      dfcGroup2: input.dfcGroup2?.trim() || null,
      dreGroup1: input.dreGroup1?.trim() || null,
      dreGroup2: input.dreGroup2?.trim() || null,
      includeInFcd: input.includeInFcd ?? true,
      includeInFcm: input.includeInFcm ?? true,
      active: input.active ?? true,
      updatedAt: new Date(),
    };
    if (input.id) {
      await db
        .update(schema.chartAccounts)
        .set(values)
        .where(
          and(eq(schema.chartAccounts.id, input.id), eq(schema.chartAccounts.tenantId, tenant.id))
        );
      return { ok: true, id: input.id };
    }
    const [row] = await db
      .insert(schema.chartAccounts)
      .values(values)
      .returning({ id: schema.chartAccounts.id });
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, "Não foi possível salvar a conta");
  }
}

export async function upsertBankAccount(input: {
  id?: string;
  name: string;
  institution?: string;
  accountType?: "checking" | "savings" | "internal" | "other";
  bankCode?: string;
  openingBalanceCents?: number;
  openingBalanceDate?: string;
  branchId?: string | null;
  active?: boolean;
}): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const name = input.name.trim();
    if (!name) throw new AppError("VALIDATION", "Nome é obrigatório");
    const db = createDb();
    const values = {
      tenantId: tenant.id,
      name,
      institution: input.institution?.trim() || null,
      accountType: input.accountType ?? "checking",
      bankCode: input.bankCode?.trim() || null,
      openingBalanceCents: Math.round(input.openingBalanceCents ?? 0),
      openingBalanceDate: input.openingBalanceDate || null,
      branchId: input.branchId || null,
      active: input.active ?? true,
      updatedAt: new Date(),
    };
    if (input.id) {
      await db
        .update(schema.bankAccounts)
        .set(values)
        .where(
          and(eq(schema.bankAccounts.id, input.id), eq(schema.bankAccounts.tenantId, tenant.id))
        );
      return { ok: true, id: input.id };
    }
    const [row] = await db
      .insert(schema.bankAccounts)
      .values(values)
      .returning({ id: schema.bankAccounts.id });
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, "Não foi possível salvar a conta bancária");
  }
}

export async function upsertTreasuryPaymentMethod(input: {
  id?: string;
  name: string;
  code?: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const name = input.name.trim();
    if (!name) throw new AppError("VALIDATION", "Nome é obrigatório");
    const db = createDb();
    if (input.id) {
      await db
        .update(schema.treasuryPaymentMethods)
        .set({
          name,
          code: input.code?.trim() || null,
          active: input.active ?? true,
          sortOrder: input.sortOrder ?? 0,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.treasuryPaymentMethods.id, input.id),
            eq(schema.treasuryPaymentMethods.tenantId, tenant.id)
          )
        );
      return { ok: true, id: input.id };
    }
    const [row] = await db
      .insert(schema.treasuryPaymentMethods)
      .values({
        tenantId: tenant.id,
        name,
        code: input.code?.trim() || null,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning({ id: schema.treasuryPaymentMethods.id });
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, "Não foi possível salvar o meio");
  }
}

export type FinanceEntryInput = {
  id?: string;
  direction: FinanceDirection;
  description: string;
  partyName?: string;
  chartAccountId?: string | null;
  bankAccountId?: string | null;
  treasuryPaymentMethodId?: string | null;
  creditCardId?: string | null;
  cardInvoiceId?: string | null;
  costCenter?: string;
  docType?: string;
  docNumber?: string;
  issueDate?: string | null;
  dueDate?: string | null;
  forecastCents?: number | null;
  budgetCents?: number | null;
  actualCents?: number | null;
  installmentTotal?: number | null;
  recurrence?: FinanceRecurrence;
  isForecastOnly?: boolean;
  branchId?: string | null;
  notes?: string;
  /** Ao criar: gera N parcelas a partir do dueDate. */
  generateInstallments?: boolean;
};

function addRecurrence(dateStr: string, recurrence: FinanceRecurrence, n: number): string {
  if (recurrence === "weekly") return shiftDateSp(dateStr, 7 * n);
  if (recurrence === "biweekly") return shiftDateSp(dateStr, 14 * n);
  if (recurrence === "monthly") {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + n, d));
    return dt.toISOString().slice(0, 10);
  }
  if (recurrence === "bimonthly") {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + 2 * n, d));
    return dt.toISOString().slice(0, 10);
  }
  return dateStr;
}

export async function upsertFinanceEntry(input: FinanceEntryInput): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const description = input.description.trim();
    if (!description) throw new AppError("VALIDATION", "Descrição é obrigatória");
    const db = createDb();

    const base = {
      tenantId: tenant.id,
      direction: input.direction,
      description,
      partyName: input.partyName?.trim() || null,
      chartAccountId: input.chartAccountId || null,
      bankAccountId: input.bankAccountId || null,
      treasuryPaymentMethodId: input.treasuryPaymentMethodId || null,
      creditCardId: input.creditCardId || null,
      cardInvoiceId: input.cardInvoiceId || null,
      costCenter: input.costCenter?.trim() || null,
      docType: input.docType?.trim() || null,
      docNumber: input.docNumber?.trim() || null,
      issueDate: input.issueDate || null,
      dueDate: input.dueDate || null,
      forecastCents: input.forecastCents ?? null,
      budgetCents: input.budgetCents ?? null,
      actualCents: input.actualCents ?? null,
      recurrence: input.recurrence ?? "none",
      isForecastOnly: input.isForecastOnly ?? false,
      branchId: input.branchId || null,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    };

    if (input.id) {
      await db
        .update(schema.financeEntries)
        .set(base)
        .where(
          and(
            eq(schema.financeEntries.id, input.id),
            eq(schema.financeEntries.tenantId, tenant.id)
          )
        );
      return { ok: true, id: input.id };
    }

    const total = Math.max(1, Math.min(60, input.installmentTotal ?? 1));
    const gen =
      input.generateInstallments &&
      total > 1 &&
      input.dueDate &&
      (input.recurrence ?? "none") !== "none";

    if (gen) {
      const amount = input.forecastCents ?? input.actualCents ?? input.budgetCents ?? 0;
      const slice = Math.round(amount / total);
      let parentId: string | null = null;
      let firstId = "";
      for (let i = 0; i < total; i++) {
        const due = addRecurrence(input.dueDate!, input.recurrence ?? "monthly", i);
        const [row]: { id: string }[] = await db
          .insert(schema.financeEntries)
          .values({
            ...base,
            dueDate: due,
            forecastCents: slice,
            installmentIndex: i + 1,
            installmentTotal: total,
            parentEntryId: parentId,
          })
          .returning({ id: schema.financeEntries.id });
        if (i === 0) {
          firstId = row.id;
          parentId = row.id;
        }
      }
      return { ok: true, id: firstId };
    }

    const [row] = await db
      .insert(schema.financeEntries)
      .values({
        ...base,
        installmentIndex: total > 1 ? 1 : null,
        installmentTotal: total > 1 ? total : null,
      })
      .returning({ id: schema.financeEntries.id });
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, "Não foi possível salvar o título");
  }
}

export async function settleFinanceEntry(input: {
  id: string;
  actualCents?: number;
  settledAt?: string;
  bankAccountId?: string | null;
}): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const db = createDb();
    const [existing] = await db
      .select()
      .from(schema.financeEntries)
      .where(
        and(
          eq(schema.financeEntries.id, input.id),
          eq(schema.financeEntries.tenantId, tenant.id),
          isNull(schema.financeEntries.deletedAt)
        )
      )
      .limit(1);
    if (!existing) throw new AppError("NOT_FOUND", "Título não encontrado");

    const actual =
      input.actualCents ??
      existing.actualCents ??
      existing.forecastCents ??
      existing.budgetCents ??
      0;

    await db
      .update(schema.financeEntries)
      .set({
        settledAt: input.settledAt ? new Date(input.settledAt) : new Date(),
        actualCents: Math.round(actual),
        bankAccountId: input.bankAccountId !== undefined ? input.bankAccountId : existing.bankAccountId,
        isForecastOnly: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.financeEntries.id, input.id));

    return { ok: true, id: input.id };
  } catch (err) {
    return fail(err, "Não foi possível baixar o título");
  }
}

export async function reconcileFinanceEntry(input: {
  id: string;
  reconciled: boolean;
}): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const db = createDb();
    await db
      .update(schema.financeEntries)
      .set({
        reconciledAt: input.reconciled ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.financeEntries.id, input.id), eq(schema.financeEntries.tenantId, tenant.id))
      );
    return { ok: true, id: input.id };
  } catch (err) {
    return fail(err, "Não foi possível conciliar");
  }
}

export async function softDeleteFinanceEntry(id: string): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const db = createDb();
    await db
      .update(schema.financeEntries)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(schema.financeEntries.id, id), eq(schema.financeEntries.tenantId, tenant.id))
      );
    return { ok: true, id };
  } catch (err) {
    return fail(err, "Não foi possível excluir");
  }
}

export async function upsertCreditCard(input: {
  id?: string;
  name: string;
  institution?: string;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  branchId?: string | null;
  active?: boolean;
}): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const name = input.name.trim();
    if (!name) throw new AppError("VALIDATION", "Nome é obrigatório");
    const db = createDb();
    const values = {
      tenantId: tenant.id,
      name,
      institution: input.institution?.trim() || null,
      limitCents: Math.max(0, Math.round(input.limitCents)),
      closingDay: Math.min(28, Math.max(1, input.closingDay)),
      dueDay: Math.min(28, Math.max(1, input.dueDay)),
      branchId: input.branchId || null,
      active: input.active ?? true,
      updatedAt: new Date(),
    };
    if (input.id) {
      await db
        .update(schema.creditCards)
        .set(values)
        .where(and(eq(schema.creditCards.id, input.id), eq(schema.creditCards.tenantId, tenant.id)));
      return { ok: true, id: input.id };
    }
    const [row] = await db
      .insert(schema.creditCards)
      .values(values)
      .returning({ id: schema.creditCards.id });
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, "Não foi possível salvar o cartão");
  }
}

export async function openCardInvoice(input: {
  creditCardId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}): Promise<ActionResult> {
  try {
    const { tenant } = await requireTreasuryWrite();
    const db = createDb();
    const [row] = await db
      .insert(schema.cardInvoices)
      .values({
        tenantId: tenant.id,
        creditCardId: input.creditCardId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        dueDate: input.dueDate,
        status: "open",
      })
      .returning({ id: schema.cardInvoices.id });
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err, "Não foi possível abrir a fatura");
  }
}
