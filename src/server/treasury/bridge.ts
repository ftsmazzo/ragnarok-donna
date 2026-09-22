"use server";

import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { todaySp } from "@/lib/datetime";
import type { DbTransaction } from "@/db";

/**
 * Ponte idempotente: payment POS → título de receita na tesouraria.
 * Nunca mexe em cash_sessions. Um paymentId → no máximo um finance_entry_link.
 */
export async function bridgePaymentToTreasury(
  tx: DbTransaction,
  input: {
    tenantId: string;
    paymentId: string;
    orderId?: string | null;
    amountCents: number;
    method: string;
    description?: string;
    branchId?: string | null;
    paidAt?: Date;
  }
): Promise<{ created: boolean; entryId?: string }> {
  const [settings] = await tx
    .select()
    .from(schema.treasuryBridgeSettings)
    .where(eq(schema.treasuryBridgeSettings.tenantId, input.tenantId))
    .limit(1);

  if (!settings?.enabled) return { created: false };

  let methods: string[] = [];
  try {
    methods = JSON.parse(settings.methodCodes) as string[];
  } catch {
    methods = ["pix", "cash", "debit", "credit", "transfer"];
  }
  if (!methods.includes(input.method)) return { created: false };

  const [existingLink] = await tx
    .select({ id: schema.financeEntryLinks.id, financeEntryId: schema.financeEntryLinks.financeEntryId })
    .from(schema.financeEntryLinks)
    .where(eq(schema.financeEntryLinks.paymentId, input.paymentId))
    .limit(1);
  if (existingLink) return { created: false, entryId: existingLink.financeEntryId };

  const code = settings.defaultChartAccountCode || "121";
  const [chart] = await tx
    .select({ id: schema.chartAccounts.id })
    .from(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, input.tenantId),
        eq(schema.chartAccounts.code, code),
        isNull(schema.chartAccounts.deletedAt)
      )
    )
    .limit(1);

  const paidAt = input.paidAt ?? new Date();
  const day = paidAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const [entry] = await tx
    .insert(schema.financeEntries)
    .values({
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      direction: "credit",
      description: input.description || `Receita POS · ${input.method}`,
      chartAccountId: chart?.id ?? null,
      issueDate: day,
      dueDate: day,
      settledAt: paidAt,
      actualCents: Math.round(input.amountCents),
      forecastCents: Math.round(input.amountCents),
      isForecastOnly: false,
      externalSource: "pos_payment",
      externalId: input.paymentId,
    })
    .returning({ id: schema.financeEntries.id });

  await tx.insert(schema.financeEntryLinks).values({
    tenantId: input.tenantId,
    financeEntryId: entry.id,
    orderId: input.orderId ?? null,
    paymentId: input.paymentId,
  });

  return { created: true, entryId: entry.id };
}

export async function getTreasuryBridgeSettings(): Promise<{
  enabled: boolean;
  methodCodes: string[];
  defaultChartAccountCode: string;
}> {
  const { requireTenantContext } = await import("../context/tenant");
  const tenant = await requireTenantContext();
  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.treasuryBridgeSettings)
    .where(eq(schema.treasuryBridgeSettings.tenantId, tenant.id))
    .limit(1);
  if (!row) {
    return {
      enabled: false,
      methodCodes: ["pix", "cash", "debit", "credit", "transfer"],
      defaultChartAccountCode: "121",
    };
  }
  let methodCodes: string[] = [];
  try {
    methodCodes = JSON.parse(row.methodCodes) as string[];
  } catch {
    methodCodes = ["pix", "cash", "debit", "credit", "transfer"];
  }
  return {
    enabled: row.enabled,
    methodCodes,
    defaultChartAccountCode: row.defaultChartAccountCode || "121",
  };
}

export async function saveTreasuryBridgeSettings(input: {
  enabled: boolean;
  methodCodes: string[];
  defaultChartAccountCode?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { requireSession, requireTenantContext } = await import("../context/tenant");
    const { requireCapability } = await import("../permissions/guards");
    const session = await requireSession();
    requireCapability(session, "finance.treasury");
    const tenant = await requireTenantContext();
    const db = createDb();
    const payload = {
      tenantId: tenant.id,
      enabled: input.enabled,
      methodCodes: JSON.stringify(input.methodCodes),
      defaultChartAccountCode: input.defaultChartAccountCode || "121",
      updatedAt: new Date(),
    };
    await db
      .insert(schema.treasuryBridgeSettings)
      .values(payload)
      .onConflictDoUpdate({
        target: schema.treasuryBridgeSettings.tenantId,
        set: {
          enabled: payload.enabled,
          methodCodes: payload.methodCodes,
          defaultChartAccountCode: payload.defaultChartAccountCode,
          updatedAt: payload.updatedAt,
        },
      });
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível salvar a ponte" };
  }
}

/** Reprocessa pagamentos recentes sem link (manual / catch-up). */
export async function backfillTreasuryBridge(limit = 50): Promise<{
  ok: true;
  created: number;
} | { ok: false; error: string }> {
  try {
    const { requireSession, requireTenantContext } = await import("../context/tenant");
    const { requireCapability } = await import("../permissions/guards");
    const session = await requireSession();
    requireCapability(session, "finance.treasury");
    const tenant = await requireTenantContext();
    const db = createDb();

    const payments = await db
      .select({
        id: schema.payments.id,
        orderId: schema.payments.orderId,
        amountCents: schema.payments.amountCents,
        method: schema.payments.method,
        paidAt: schema.payments.paidAt,
      })
      .from(schema.payments)
      .where(eq(schema.payments.tenantId, tenant.id))
      .orderBy(schema.payments.paidAt)
      .limit(limit * 3);

    let created = 0;
    for (const p of payments) {
      if (created >= limit) break;
      const result = await db.transaction(async (tx) =>
        bridgePaymentToTreasury(tx, {
          tenantId: tenant.id,
          paymentId: p.id,
          orderId: p.orderId,
          amountCents: p.amountCents,
          method: p.method,
          paidAt: p.paidAt,
          description: `Receita POS · ${p.method} · ${todaySp()}`,
        })
      );
      if (result.created) created++;
    }
    return { ok: true, created };
  } catch {
    return { ok: false, error: "Falha no backfill" };
  }
}
