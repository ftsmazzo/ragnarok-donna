/**
 * Importa carteiras de pacotes AppBarber → client_packages + client_package_credits.
 *
 * DATABASE_URL=... node scripts/import-pacote-carteiras.mjs --dir path/to/export --tenant ragnaroks
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

const DIR = path.resolve(arg("--dir", "research/export/latest-pacote-carteiras"));
const TENANT_SLUG = arg("--tenant", "ragnaroks");
const DRY = args.includes("--dry");
const EXTERNAL_SOURCE = "appbarber";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL obrigatório");
  process.exit(1);
}
if (!fs.existsSync(DIR)) {
  console.error("Pasta não encontrada:", DIR);
  process.exit(1);
}

function readJson(name) {
  const p = path.join(DIR, `${name}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function toNum(v) {
  if (v == null || v === "") return 0;
  return Number(String(v).replace(",", ".")) || 0;
}

function cleanStr(v, max = 160) {
  const s = String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, max);
}

function parseBrDateTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = m;
  const iso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(ss).padStart(2, "0")}-03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ativos = readJson("pacotes-venda-ativos");
const detalhes = readJson("pacote-venda-detalhes");
const rows = Array.isArray(ativos) && ativos.length ? ativos : detalhes;
if (!Array.isArray(rows) || !rows.length) {
  console.error("Nenhum pacote-venda-ativos.json / pacote-venda-detalhes.json em", DIR);
  process.exit(1);
}

console.log(`Fonte: ${DIR} (${rows.length} carteiras)`);

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 20,
  idle_timeout: 20,
});

try {
  console.log("Schema…");
  await sql`
    ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS external_source varchar(40)
  `;
  await sql`
    ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS external_id varchar(80)
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS client_packages_tenant_ext_uidx
    ON client_packages (tenant_id, external_source, external_id)
  `;

  console.log("Tenant + mapas…");
  const [tenant] = await sql`
    select id from tenants where slug = ${TENANT_SLUG} limit 1
  `;
  if (!tenant) throw new Error(`tenant ${TENANT_SLUG} não encontrado`);
  const tenantId = tenant.id;

  const clients = await sql`
    select id, external_id from clients
    where tenant_id = ${tenantId} and deleted_at is null and external_id is not null
  `;
  const clientByExt = new Map(clients.map((c) => [String(c.external_id), c.id]));

  const packages = await sql`
    select id, external_id from packages
    where tenant_id = ${tenantId} and deleted_at is null and external_id is not null
  `;
  const packageByExt = new Map(packages.map((p) => [String(p.external_id), p.id]));

  const services = await sql`
    select id, external_id from services
    where tenant_id = ${tenantId} and deleted_at is null and external_id is not null
  `;
  const serviceByExt = new Map(services.map((s) => [String(s.external_id), s.id]));

  const products = await sql`
    select id, external_id from products
    where tenant_id = ${tenantId} and deleted_at is null and external_id is not null
  `;
  const productByExt = new Map(products.map((p) => [String(p.external_id), p.id]));

  const existingPkgs = await sql`
    select id, external_id from client_packages
    where tenant_id = ${tenantId}
      and external_source = ${EXTERNAL_SOURCE}
      and external_id is not null
  `;
  const existingByExt = new Map(
    existingPkgs.map((r) => [String(r.external_id), r.id])
  );

  console.log(
    `Mapas: clients=${clientByExt.size} packages=${packageByExt.size} services=${serviceByExt.size} existing=${existingByExt.size}`
  );

  const now = new Date();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let unmatchedClient = 0;
  let noCredits = 0;
  const misses = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ppa = String(row.PPa_Codigo || "").trim();
    const pes = String(row.Pes_Codigo || "").trim();
    if (!ppa || !pes) {
      skipped += 1;
      continue;
    }

    const clientId = clientByExt.get(pes);
    if (!clientId) {
      unmatchedClient += 1;
      if (misses.length < 30) {
        misses.push({ ppa, pes, name: row.Pes_Nome, reason: "client" });
      }
      continue;
    }

    const creditItems = [];
    for (const it of row.items || []) {
      const serExt = String(it.Ser_Codigo || "").trim();
      const proExt = String(it.Pro_Codigo || "").trim();
      const totalQty = Math.max(0, Math.round(toNum(it.PTe_Quantidade)));
      const usedQty = Math.max(0, Math.round(toNum(it.Utilizados)));
      const remainingQty = Math.max(0, totalQty - usedQty);
      if (totalQty <= 0) continue;

      const serviceId = serExt ? serviceByExt.get(serExt) ?? null : null;
      const productId = proExt ? productByExt.get(proExt) ?? null : null;
      if (!serviceId && !productId) {
        if (misses.length < 40) {
          misses.push({
            ppa,
            serExt,
            proExt,
            desc: it.Ser_Descricao || it.Pro_Descricao,
            reason: "item",
          });
        }
        continue;
      }
      creditItems.push({ serviceId, productId, totalQty, remainingQty });
    }

    const remainingTotal = creditItems.reduce((a, c) => a + c.remainingQty, 0);
    if (remainingTotal <= 0 || creditItems.length === 0) {
      noCredits += 1;
      continue;
    }

    const pacExt = String(row.Pac_Codigo || "").trim();
    const packageId = pacExt ? packageByExt.get(pacExt) ?? null : null;
    const name =
      cleanStr(row.Pac_Descricao || row.Pes_Nome || "Pacote", 160) || "Pacote";
    const purchasedAt = parseBrDateTime(row.PPa_Dat_Cadastro) || now;
    const expiresAt = parseBrDateTime(row.PPa_Expiracao);
    let status = "active";
    if (expiresAt && expiresAt.getTime() < now.getTime()) status = "expired";

    const existingId = existingByExt.get(ppa);
    let clientPackageId;

    if (DRY) {
      if (existingId) updated += 1;
      else inserted += 1;
      continue;
    }

    await sql.begin(async (tx) => {
      if (existingId) {
        await tx`
          update client_packages set
            client_id = ${clientId},
            package_id = ${packageId},
            name = ${name},
            status = ${status},
            purchased_at = ${purchasedAt},
            expires_at = ${expiresAt},
            updated_at = now()
          where id = ${existingId}
        `;
        await tx`
          delete from client_package_credits where client_package_id = ${existingId}
        `;
        clientPackageId = existingId;
        updated += 1;
      } else {
        const [created] = await tx`
          insert into client_packages (
            tenant_id, client_id, package_id, name, status,
            purchased_at, expires_at, external_source, external_id
          ) values (
            ${tenantId}, ${clientId}, ${packageId}, ${name}, ${status},
            ${purchasedAt}, ${expiresAt}, ${EXTERNAL_SOURCE}, ${ppa}
          )
          returning id
        `;
        clientPackageId = created.id;
        existingByExt.set(ppa, clientPackageId);
        inserted += 1;
      }

      if (creditItems.length) {
        const creditRows = creditItems.map((c) => ({
          tenant_id: tenantId,
          client_package_id: clientPackageId,
          service_id: c.serviceId,
          product_id: c.productId,
          total_qty: c.totalQty,
          remaining_qty: c.remainingQty,
        }));
        await tx`insert into client_package_credits ${tx(creditRows)}`;
      }
    });

    if ((i + 1) % 25 === 0 || i + 1 === rows.length) {
      console.log(
        `  … ${i + 1}/${rows.length} (ins=${inserted} upd=${updated} missClient=${unmatchedClient} noCred=${noCredits})`
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        dry: DRY,
        tenant: TENANT_SLUG,
        dir: DIR,
        sourceRows: rows.length,
        inserted,
        updated,
        skipped,
        unmatchedClient,
        noCredits,
        missSample: misses.slice(0, 15),
      },
      null,
      2
    )
  );
} finally {
  await sql.end({ timeout: 5 });
}
