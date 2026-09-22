"use server";

import { createHash } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import planoDonna from "./seed/plano_de_contas_donna.json";
import amostra from "./seed/base_de_dados_amostra.json";

export type SeedResult =
  | { ok: true; accounts: number; entries: number; methods: number; banks: number }
  | { ok: false; error: string };

const DEFAULT_METHODS = [
  { name: "PIX", code: "pix", sortOrder: 1 },
  { name: "Dinheiro", code: "cash", sortOrder: 2 },
  { name: "Débito", code: "debit", sortOrder: 3 },
  { name: "Crédito", code: "credit", sortOrder: 4 },
  { name: "Transferência", code: "transfer", sortOrder: 5 },
  { name: "Boleto", code: "boleto", sortOrder: 6 },
  { name: "Cheque", code: "check", sortOrder: 7 },
  { name: "Outro", code: "other", sortOrder: 99 },
];

/** Importa plano de contas Donna + amostra de títulos (idempotente). */
export async function seedTreasuryFromDonnaSample(): Promise<SeedResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "finance.treasury");
    const tenant = await requireTenantContext();
    const db = createDb();

    let accounts = 0;
    for (const a of planoDonna as Array<{
      code: string;
      name: string;
      syntheticName: string | null;
      dfcGroup1: string | null;
      dfcGroup2: string | null;
      dreGroup1: string | null;
      dreGroup2: string | null;
      checkFcd: boolean;
      checkFcm: boolean;
    }>) {
      if (!a.code || !a.name) continue;
      await db
        .insert(schema.chartAccounts)
        .values({
          tenantId: tenant.id,
          code: String(a.code),
          name: a.name,
          syntheticName: a.syntheticName,
          dfcGroup1: a.dfcGroup1,
          dfcGroup2: a.dfcGroup2,
          dreGroup1: a.dreGroup1,
          dreGroup2: a.dreGroup2,
          includeInFcd: a.checkFcd,
          includeInFcm: a.checkFcm,
          active: true,
        })
        .onConflictDoUpdate({
          target: [schema.chartAccounts.tenantId, schema.chartAccounts.code],
          set: {
            name: a.name,
            syntheticName: a.syntheticName,
            dfcGroup1: a.dfcGroup1,
            dfcGroup2: a.dfcGroup2,
            dreGroup1: a.dreGroup1,
            dreGroup2: a.dreGroup2,
            includeInFcd: a.checkFcd,
            includeInFcm: a.checkFcm,
            updatedAt: new Date(),
            deletedAt: null,
          },
        });
      accounts++;
    }

    let methods = 0;
    for (const m of DEFAULT_METHODS) {
      const existing = await db
        .select({ id: schema.treasuryPaymentMethods.id })
        .from(schema.treasuryPaymentMethods)
        .where(
          and(
            eq(schema.treasuryPaymentMethods.tenantId, tenant.id),
            eq(schema.treasuryPaymentMethods.name, m.name)
          )
        )
        .limit(1);
      if (existing[0]) continue;
      await db.insert(schema.treasuryPaymentMethods).values({
        tenantId: tenant.id,
        name: m.name,
        code: m.code,
        sortOrder: m.sortOrder,
        active: true,
      });
      methods++;
    }

    const bankNames = new Set<string>();
    for (const row of amostra as Array<{ bankInstitution?: string | null }>) {
      if (row.bankInstitution) bankNames.add(row.bankInstitution);
    }
    bankNames.add("Caixa interno");
    let banks = 0;
    for (const name of bankNames) {
      const existing = await db
        .select({ id: schema.bankAccounts.id })
        .from(schema.bankAccounts)
        .where(
          and(
            eq(schema.bankAccounts.tenantId, tenant.id),
            eq(schema.bankAccounts.name, name),
            isNull(schema.bankAccounts.deletedAt)
          )
        )
        .limit(1);
      if (existing[0]) continue;
      await db.insert(schema.bankAccounts).values({
        tenantId: tenant.id,
        name,
        institution: name,
        accountType: name.toLowerCase().includes("caixa") ? "internal" : "checking",
        openingBalanceCents: 0,
        active: true,
      });
      banks++;
    }

    const charts = await db
      .select({ id: schema.chartAccounts.id, code: schema.chartAccounts.code })
      .from(schema.chartAccounts)
      .where(
        and(eq(schema.chartAccounts.tenantId, tenant.id), isNull(schema.chartAccounts.deletedAt))
      );
    const chartByCode = new Map(charts.map((c) => [c.code, c.id]));

    const bankRows = await db
      .select({ id: schema.bankAccounts.id, name: schema.bankAccounts.name })
      .from(schema.bankAccounts)
      .where(
        and(eq(schema.bankAccounts.tenantId, tenant.id), isNull(schema.bankAccounts.deletedAt))
      );
    const bankByName = new Map(bankRows.map((b) => [b.name, b.id]));

    const pms = await db
      .select({ id: schema.treasuryPaymentMethods.id, name: schema.treasuryPaymentMethods.name })
      .from(schema.treasuryPaymentMethods)
      .where(eq(schema.treasuryPaymentMethods.tenantId, tenant.id));
    const pmByName = new Map(pms.map((p) => [p.name.toLowerCase(), p.id]));

    let entries = 0;
    for (const row of amostra as Array<{
      responsible: string | null;
      direction: "credit" | "debit";
      description: string;
      partyName: string | null;
      aprCode: string | null;
      costCenter: string | null;
      paymentMean: string | null;
      docType: string | null;
      docNumber: string | null;
      issueDate: string | null;
      dueDate: string | null;
      settleDate: string | null;
      forecastCents: number | null;
      budgetCents: number | null;
      actualCents: number | null;
      installmentsLabel: string | null;
      bankInstitution: string | null;
    }>) {
      const hash = createHash("sha1")
        .update(
          [
            row.description,
            row.dueDate,
            row.issueDate,
            row.direction,
            row.aprCode,
            row.forecastCents,
            row.actualCents,
          ].join("|")
        )
        .digest("hex")
        .slice(0, 24);

      const existing = await db
        .select({ id: schema.financeEntries.id })
        .from(schema.financeEntries)
        .where(
          and(
            eq(schema.financeEntries.tenantId, tenant.id),
            eq(schema.financeEntries.externalSource, "donna_dfc_sample"),
            eq(schema.financeEntries.externalId, hash)
          )
        )
        .limit(1);
      if (existing[0]) continue;

      let installmentIndex: number | null = null;
      let installmentTotal: number | null = null;
      if (row.installmentsLabel && /\d+\s*\/\s*\d+/.test(row.installmentsLabel)) {
        const [a, b] = row.installmentsLabel.split("/").map((x) => Number(x.trim()));
        if (a && b) {
          installmentIndex = a;
          installmentTotal = b;
        }
      }

      await db.insert(schema.financeEntries).values({
        tenantId: tenant.id,
        direction: row.direction,
        description: row.description,
        partyName: row.partyName,
        chartAccountId: row.aprCode ? chartByCode.get(String(row.aprCode)) ?? null : null,
        bankAccountId: row.bankInstitution ? bankByName.get(row.bankInstitution) ?? null : null,
        treasuryPaymentMethodId: row.paymentMean
          ? pmByName.get(row.paymentMean.toLowerCase()) ?? null
          : null,
        costCenter: row.costCenter,
        docType: row.docType,
        docNumber: row.docNumber,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        settledAt: row.settleDate ? new Date(`${row.settleDate}T12:00:00-03:00`) : null,
        forecastCents: row.forecastCents,
        budgetCents: row.budgetCents,
        actualCents: row.actualCents,
        installmentIndex,
        installmentTotal,
        isForecastOnly: !row.settleDate && !(row.actualCents && row.actualCents > 0),
        externalSource: "donna_dfc_sample",
        externalId: hash,
        notes: row.responsible ? `Responsável: ${row.responsible}` : null,
      });
      entries++;
    }

    return { ok: true, accounts, entries, methods, banks };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    console.error("[seedTreasury]", err);
    return { ok: false, error: "Falha ao importar seed da Donna" };
  }
}
