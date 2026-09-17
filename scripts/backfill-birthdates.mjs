/**
 * Backfill birth_date a partir do export AppBarber (campo Nascimento).
 *
 * DATABASE_URL=... node scripts/backfill-birthdates.mjs
 * Opcional: APPBARBER_CLIENTS_JSON=path/to/clientes.json
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

function loadEnvFile() {
  const p = path.resolve(".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvFile();

const DATABASE_URL = process.env.DATABASE_URL;
const PREBUILT = path.resolve("data/appbarber-birthdates.json");
const CLIENTS_JSON =
  process.env.APPBARBER_CLIENTS_JSON ||
  path.resolve("research/export/2026-09-13T12-25-22/clientes.json");

if (!DATABASE_URL) {
  console.error("DATABASE_URL obrigatório");
  process.exit(1);
}

/** DD/MM/YYYY → YYYY-MM-DD */
function parseDateBr(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

let withBirth = [];
if (fs.existsSync(PREBUILT)) {
  const packed = JSON.parse(fs.readFileSync(PREBUILT, "utf8"));
  withBirth = (Array.isArray(packed) ? packed : [])
    .map((r) => ({
      externalId: String(r.e || r.externalId || "").trim(),
      birthDate: String(r.b || r.birthDate || "").trim() || null,
    }))
    .filter((r) => r.externalId && /^\d{4}-\d{2}-\d{2}$/.test(r.birthDate));
  console.log(`Pré-computado: ${withBirth.length} aniversários em ${PREBUILT}`);
} else {
  const rows = JSON.parse(fs.readFileSync(CLIENTS_JSON, "utf8"));
  const list = Array.isArray(rows) ? rows : rows.data || [];
  withBirth = list
    .map((r) => ({
      externalId: String(r.Codigo || r.Cli_Codigo || "").trim(),
      birthDate: parseDateBr(r.Nascimento),
    }))
    .filter((r) => r.externalId && r.birthDate);
  console.log(`Export: ${list.length} clientes · ${withBirth.length} com Nascimento válido`);
}

const sql = postgres(DATABASE_URL, { max: 1 });
try {
  let updated = 0;
  let skipped = 0;
  for (const row of withBirth) {
    const res = await sql`
      update clients
      set birth_date = ${row.birthDate}::date,
          updated_at = now()
      where external_source = 'appbarber'
        and external_id = ${row.externalId}
        and (birth_date is null or birth_date is distinct from ${row.birthDate}::date)
    `;
    const n = res.count ?? 0;
    if (n > 0) updated += n;
    else skipped += 1;
  }
  console.log(`Atualizados: ${updated} · sem mudança/não encontrados: ${skipped}`);
} finally {
  await sql.end({ timeout: 5 });
}
