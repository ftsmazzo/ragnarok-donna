/**
 * Importa saldos Conta Cliente (fiado) a partir do export AppBarber.
 *
 * Aceita:
 *   - contacliente-table-nonzero.json  [{ name, saldo }]
 *   - conta-cliente-saldos-nonzero.json [{ CodigoCliente|Pes_Codigo, saldoParsed }]
 *
 * DATABASE_URL=... node scripts/import-conta-cliente-saldos.mjs --file path/to.json
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

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const FILE = path.resolve(
  arg("--file", "data/appbarber-conta-cliente.json")
);
const TENANT_SLUG = arg("--tenant", "ragnaroks");
const DRY = args.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL obrigatório");
  process.exit(1);
}
if (!fs.existsSync(FILE)) {
  console.error("Arquivo não encontrado:", FILE);
  process.exit(1);
}

function parseBRL(v) {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).replace(/R\$\s?/g, "").trim();
  if (!s) return 0;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(s) || 0;
}

function normName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
const rows = Array.isArray(raw) ? raw : raw.data || [];

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 15 });
try {
  const [tenant] = await sql`select id from tenants where slug = ${TENANT_SLUG} limit 1`;
  if (!tenant) throw new Error(`tenant ${TENANT_SLUG} não encontrado`);

  const clients = await sql`
    select id, name, external_id, account_balance_cents
    from clients
    where tenant_id = ${tenant.id} and deleted_at is null
  `;
  const byExt = new Map(clients.map((c) => [String(c.external_id), c]));
  const byName = new Map();
  for (const c of clients) {
    const k = normName(c.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c);
  }

  let updated = 0;
  let unmatched = 0;
  let skipped = 0;
  const misses = [];

  for (const r of rows) {
    const code = String(r.CodigoCliente || r.Pes_Codigo || r.e || r.codigo || "").trim();
    const saldo =
      r.saldoParsed != null
        ? Number(r.saldoParsed)
        : r.saldo != null
          ? Number(r.saldo)
          : r.s != null
            ? Number(r.s)
            : parseBRL(r.saldoRaw || r.PCo_Saldo);
    if (!Number.isFinite(saldo) || Math.abs(saldo) < 0.0001) {
      skipped += 1;
      continue;
    }
    /** Nosso ledger: negativo = cliente deve (fiado). AppBarber débito já vem negativo. */
    const balanceCents = Math.round(saldo * 100);

    let client = code ? byExt.get(code) : null;
    if (!client && (r.name || r.n)) {
      const list = byName.get(normName(r.name || r.n)) || [];
      if (list.length === 1) client = list[0];
    }
    if (!client) {
      unmatched += 1;
      if (misses.length < 40) misses.push({ code, name: r.name || r.n, saldo });
      continue;
    }

    if (client.account_balance_cents === balanceCents) {
      skipped += 1;
      continue;
    }

    if (DRY) {
      console.log("DRY", client.name, client.account_balance_cents, "→", balanceCents);
      updated += 1;
      continue;
    }

    await sql.begin(async (tx) => {
      await tx`
        update clients
        set account_balance_cents = ${balanceCents}, updated_at = now()
        where id = ${client.id}
      `;
      const delta = balanceCents - Number(client.account_balance_cents || 0);
      if (delta !== 0) {
        await tx`
          insert into client_account_ledger (
            tenant_id, client_id, delta_cents, balance_after_cents,
            reason, notes
          ) values (
            ${tenant.id}, ${client.id}, ${delta}, ${balanceCents},
            'import_appbarber', ${`Conta Cliente AppBarber · ${FILE}`}
          )
        `;
      }
    });
    updated += 1;
  }

  console.log({
    file: FILE,
    rows: rows.length,
    updated,
    unmatched,
    skipped,
    misses,
    dry: DRY,
  });
} finally {
  await sql.end({ timeout: 5 });
}
