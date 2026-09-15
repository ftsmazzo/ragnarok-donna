#!/usr/bin/env node
/**
 * Remarca produtos AppBarber como à venda usando disponivelApresentacao.
 *
 *   node scripts/_run-with-dotenv.mjs scripts/patch-products-for-sale.mjs --dir research/export/2026-09-13T12-25-22
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const DATABASE_URL = process.env.DATABASE_URL;
const EXPORT_DIR = path.resolve(arg("--dir", "research/export/2026-09-13T12-25-22"));
const TENANT_SLUG = arg("--tenant", "ragnaroks");

if (!DATABASE_URL) {
  console.error("DATABASE_URL obrigatória");
  process.exit(1);
}

function isInternalUse(r) {
  return (
    r.Uso === "Sim" ||
    String(r.Categoria || "")
      .toLowerCase()
      .includes("uso")
  );
}

function isForSale(r) {
  if (
    r.disponivelApresentacao === "1" ||
    r.DisponivelVenda === "1" ||
    r.DisponivelVenda === "Sim"
  ) {
    return true;
  }
  if (isInternalUse(r)) return false;
  const cat = String(r.Categoria || "").toLowerCase();
  // Flags AppBarber às vezes vêm 0 em itens de balcão (ex.: Trufa, Creme Esfoliante).
  if (cat.includes("venda") || cat.includes("comida") || cat.includes("bebida")) {
    return true;
  }
  return true;
}

const sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 20 });
try {
  const [tenant] = await sql`select id from tenants where slug = ${TENANT_SLUG} limit 1`;
  if (!tenant) throw new Error(`tenant ${TENANT_SLUG} não encontrado`);

  const products = JSON.parse(
    fs.readFileSync(path.join(EXPORT_DIR, "produtos.json"), "utf8")
  );

  let updated = 0;
  let forSale = 0;
  let internal = 0;
  for (const r of products) {
    const extId = String(r.Codigo || "").trim();
    if (!extId) continue;
    const sale = isForSale(r);
    const use = isInternalUse(r);
    if (sale) forSale += 1;
    if (use) internal += 1;
    const res = await sql`
      update products
      set
        for_sale = ${sale},
        for_internal_use = ${use},
        updated_at = now()
      where tenant_id = ${tenant.id}
        and external_source = 'appbarber'
        and external_id = ${extId}
        and (
          for_sale is distinct from ${sale}
          or for_internal_use is distinct from ${use}
        )
    `;
    updated += res.count;
  }

  const [stats] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where for_sale)::int as for_sale,
      count(*) filter (where for_sale and stock_qty > 0)::int as for_sale_in_stock,
      count(*) filter (where for_internal_use)::int as for_internal_use
    from products
    where tenant_id = ${tenant.id} and deleted_at is null
  `;

  console.log(JSON.stringify({ dumpForSale: forSale, dumpInternal: internal, updated, db: stats }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
