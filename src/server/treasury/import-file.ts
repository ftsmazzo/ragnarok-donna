"use server";

import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";

export type ImportResult =
  | { ok: true; imported: number; skipped: number; kind: "entries" | "chart" }
  | { ok: false; error: string };

function excelDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  return null;
}

function toCents(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v * 100);
  const n = Number(String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function sheetToRows(data: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(data, { type: "buffer", cellDates: false });
  const name =
    wb.SheetNames.find((n) => /base.?de.?dados/i.test(n)) ??
    wb.SheetNames.find((n) => /plano.?de.?contas/i.test(n)) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  const map = new Map(Object.keys(row).map((k) => [k.toLowerCase().trim(), k]));
  for (const want of keys) {
    const key = map.get(want.toLowerCase());
    if (key != null && row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

/** Importa títulos (aba base_de_dados ou CSV com colunas equivalentes). */
export async function importTreasuryEntriesFromFile(input: {
  base64: string;
  fileName: string;
}): Promise<ImportResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "finance.treasury");
    const tenant = await requireTenantContext();
    const buf = Buffer.from(input.base64, "base64");
    const rows = sheetToRows(buf);
    if (!rows.length) return { ok: false, error: "Arquivo sem linhas" };

    const db = createDb();
    const charts = await db
      .select({ id: schema.chartAccounts.id, code: schema.chartAccounts.code })
      .from(schema.chartAccounts)
      .where(
        and(eq(schema.chartAccounts.tenantId, tenant.id), isNull(schema.chartAccounts.deletedAt))
      );
    const chartByCode = new Map(charts.map((c) => [String(c.code), c.id]));

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const description = String(
        pick(row, ["DESCRIÇÃO", "DESCRICAO", "description", "desc"]) ?? ""
      ).trim();
      if (!description || /^descri/i.test(description)) {
        skipped++;
        continue;
      }
      const cd = String(pick(row, ["C/D", "CD", "direction", "tipo"]) ?? "D").toUpperCase();
      const direction = cd.includes("C") ? "credit" : "debit";
      const apr = pick(row, ["APR", "CÓD. APR", "COD APR", "code", "conta"]);
      const forecast = toCents(pick(row, ["FORECAST", "forecast", "previsto", "valor"]));
      const budget = toCents(pick(row, ["BUDGET", "budget", "orçado"]));
      const actual = toCents(pick(row, ["REALIZADO", "realizado", "actual"]));
      const issueDate = excelDate(pick(row, ["DATA EMISSÃO", "DATA EMISSAO", "issueDate", "emissão"]));
      const dueDate = excelDate(pick(row, ["DATA VCTO", "DATA VENCIMENTO", "dueDate", "vencimento"]));
      const settleDate = excelDate(pick(row, ["DATA BAIXA", "settleDate", "baixa"]));
      const party = pick(row, ["CLIENTE/FORNECEDOR", "CLIENTE", "FORNECEDOR", "partyName"]);
      const hash = createHash("sha1")
        .update([description, dueDate, issueDate, direction, apr, forecast, actual].join("|"))
        .digest("hex")
        .slice(0, 24);

      const [existing] = await db
        .select({ id: schema.financeEntries.id })
        .from(schema.financeEntries)
        .where(
          and(
            eq(schema.financeEntries.tenantId, tenant.id),
            eq(schema.financeEntries.externalSource, "file_import"),
            eq(schema.financeEntries.externalId, hash)
          )
        )
        .limit(1);
      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(schema.financeEntries).values({
        tenantId: tenant.id,
        direction,
        description,
        partyName: party ? String(party).trim() : null,
        chartAccountId: apr ? chartByCode.get(String(apr).trim()) ?? null : null,
        issueDate,
        dueDate,
        settledAt: settleDate ? new Date(`${settleDate}T12:00:00-03:00`) : null,
        forecastCents: forecast,
        budgetCents: budget,
        actualCents: actual,
        isForecastOnly: !settleDate && !(actual && actual > 0),
        externalSource: "file_import",
        externalId: hash,
        notes: `Importado de ${input.fileName}`,
      });
      imported++;
    }

    return { ok: true, imported, skipped, kind: "entries" };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    console.error("[importTreasuryEntries]", err);
    return { ok: false, error: "Falha ao importar arquivo" };
  }
}

/** Importa plano de contas (aba plano_de_contas ou CSV). */
export async function importChartAccountsFromFile(input: {
  base64: string;
  fileName: string;
}): Promise<ImportResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "finance.treasury");
    const tenant = await requireTenantContext();
    const buf = Buffer.from(input.base64, "base64");
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const name =
      wb.SheetNames.find((n) => /plano.?de.?contas/i.test(n)) ?? wb.SheetNames[0];
    const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], {
      header: 1,
      defval: null,
    });

    const db = createDb();
    let imported = 0;
    let skipped = 0;
    let headerFound = false;

    for (const r of raw) {
      if (!r || r.length < 4) {
        skipped++;
        continue;
      }
      const c2 = r[2];
      const c3 = r[3];
      if (
        String(c2 ?? "")
          .toUpperCase()
          .includes("CÓD") ||
        String(c2 ?? "")
          .toUpperCase()
          .includes("COD")
      ) {
        headerFound = true;
        skipped++;
        continue;
      }
      if (!headerFound && typeof c2 !== "number" && !/^\d+$/.test(String(c2 ?? ""))) {
        skipped++;
        continue;
      }
      const code = String(c2 ?? "").trim();
      const accountName = String(c3 ?? "").trim();
      if (!code || !accountName) {
        skipped++;
        continue;
      }

      await db
        .insert(schema.chartAccounts)
        .values({
          tenantId: tenant.id,
          code,
          name: accountName,
          syntheticName: r[4] ? String(r[4]).trim() : null,
          dfcGroup1: r[5] ? String(r[5]).trim() : null,
          dfcGroup2: r[6] ? String(r[6]).trim() : null,
          dreGroup1: r[7] ? String(r[7]).trim() : null,
          dreGroup2: r[8] ? String(r[8]).trim() : null,
          includeInFcd: r[0] === 1 || r[0] === "1",
          includeInFcm: r[1] === 1 || r[1] === "1",
          active: true,
        })
        .onConflictDoUpdate({
          target: [schema.chartAccounts.tenantId, schema.chartAccounts.code],
          set: {
            name: accountName,
            syntheticName: r[4] ? String(r[4]).trim() : null,
            dfcGroup1: r[5] ? String(r[5]).trim() : null,
            dfcGroup2: r[6] ? String(r[6]).trim() : null,
            dreGroup1: r[7] ? String(r[7]).trim() : null,
            dreGroup2: r[8] ? String(r[8]).trim() : null,
            updatedAt: new Date(),
            deletedAt: null,
          },
        });
      imported++;
    }

    return { ok: true, imported, skipped, kind: "chart" };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    console.error("[importChart]", err);
    return { ok: false, error: "Falha ao importar plano de contas" };
  }
}
