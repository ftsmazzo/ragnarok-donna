import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const root = process.cwd();
const wb = XLSX.readFile(path.join(root, "docs/Demandas/DFC - DONNA ELEGANTE.xlsx"));
const outDir = path.join(root, "src/server/treasury/seed");
fs.mkdirSync(outDir, { recursive: true });

function excelDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const m = String(d.m).padStart(2, "0");
    const day = String(d.d).padStart(2, "0");
    return `${d.y}-${m}-${day}`;
  }
  return String(v).slice(0, 10);
}

function toCents(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return null;
  return Math.round(Number(v) * 100);
}

const pc = XLSX.utils.sheet_to_json(wb.Sheets.plano_de_contas, { header: 1, defval: null });
const accounts = [];
for (let i = 2; i < pc.length; i++) {
  const r = pc[i];
  if (!r || r[2] == null) continue;
  const code = String(r[2]).trim();
  if (!code || code === "CÓD. APR") continue;
  accounts.push({
    code,
    name: String(r[3] || "").trim(),
    syntheticName: r[4] ? String(r[4]).trim() : null,
    dfcGroup1: r[5] ? String(r[5]).trim() : null,
    dfcGroup2: r[6] ? String(r[6]).trim() : null,
    dreGroup1: r[7] ? String(r[7]).trim() : null,
    dreGroup2: r[8] ? String(r[8]).trim() : null,
    checkFcd: r[0] === 1 || r[0] === "1",
    checkFcm: r[1] === 1 || r[1] === "1",
  });
}
fs.writeFileSync(path.join(outDir, "plano_de_contas_donna.json"), JSON.stringify(accounts, null, 2));

const bd = XLSX.utils.sheet_to_json(wb.Sheets.base_de_dados, { header: 1, defval: null, raw: true });
const sample = [];
for (let i = 2; i < bd.length && sample.length < 40; i++) {
  const r = bd[i];
  if (!r) continue;
  const desc = r[2];
  if (desc == null || String(desc).trim() === "" || String(desc) === "DESCRIÇÃO") continue;
  sample.push({
    responsible: r[0] ? String(r[0]).trim() : null,
    direction: String(r[1] || "")
      .toUpperCase()
      .includes("C")
      ? "credit"
      : "debit",
    description: String(desc).trim(),
    partyName: r[3] ? String(r[3]).trim() : null,
    aprCode: r[4] != null ? String(r[4]).trim() : null,
    costCenter: r[5] ? String(r[5]).trim() : null,
    paymentMean: r[6] ? String(r[6]).trim() : null,
    docType: r[7] ? String(r[7]).trim() : null,
    docNumber: r[8] != null ? String(r[8]).trim() : null,
    issueDate: excelDate(r[9]),
    dueDate: excelDate(r[10]),
    settleDate: excelDate(r[11]),
    bankCode: r[12] != null ? String(r[12]).trim() : null,
    forecastCents: toCents(r[13]),
    budgetCents: toCents(r[14]),
    actualCents: toCents(r[15]),
    installmentsLabel: r[16] != null ? String(r[16]).trim() : null,
    bankInstitution: r[20] ? String(r[20]).trim() : null,
  });
}
fs.writeFileSync(path.join(outDir, "base_de_dados_amostra.json"), JSON.stringify(sample, null, 2));
console.log("accounts", accounts.length, "sample", sample.length);
