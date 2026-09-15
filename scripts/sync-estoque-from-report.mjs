/**
 * Sincroniza estoque a partir do relatório da cliente (xlsx) + metadados AppBarber.
 *
 * - Atualiza stock_qty / min_qty pelo relatório
 * - Garante for_sale=true para itens de venda (não "produto para uso")
 * - Insere o que existir no export e ainda não estiver no banco
 *
 *   node scripts/_run-with-dotenv.mjs scripts/sync-estoque-from-report.mjs
 *   node scripts/_run-with-dotenv.mjs scripts/sync-estoque-from-report.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import postgres from "postgres";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const DATABASE_URL = process.env.DATABASE_URL;
const TENANT = process.env.TENANT_SLUG || "ragnaroks";
const EXPORT = path.resolve(
  args.includes("--dir")
    ? args[args.indexOf("--dir") + 1]
    : "research/export/2026-09-13T12-25-22",
  "produtos.json"
);

if (!DATABASE_URL) {
  console.error("DATABASE_URL obrigatória");
  process.exit(1);
}

function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMoney(v) {
  if (v == null || v === "") return 0;
  let s = String(v).replace(/R\$\s?/g, "").trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
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
  // Relatório de estoque da loja: se está lá e não é só uso interno, vende.
  if (isInternalUse(r)) {
    return (
      r.disponivelApresentacao === "1" ||
      r.DisponivelVenda === "1" ||
      r.DisponivelVenda === "Sim"
    );
  }
  return true;
}

const xlsxFile = fs
  .readdirSync("docs/Demandas")
  .find((f) => f.toLowerCase().endsWith(".xlsx") && /estoque/i.test(f));
if (!xlsxFile) {
  console.error("relatório estoque.xlsx não encontrado em docs/Demandas");
  process.exit(1);
}

const wb = XLSX.readFile(path.join("docs/Demandas", xlsxFile));
const reportRaw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  defval: null,
});
/** @type {Map<string, { name: string; stock: number; min: number }>} */
const reportByNorm = new Map();
for (const r of reportRaw) {
  const name = String(r.Produto ?? "").trim();
  if (!name) continue;
  const key = norm(name);
  // duplicata no xlsx (Leaven-in): mantém a última linha
  reportByNorm.set(key, {
    name,
    stock: Math.max(0, Math.round(Number(r["Qtd em Estoque"] ?? 0) || 0)),
    min: Math.max(0, Math.round(Number(r["Qtd Minima"] ?? 0) || 0)),
  });
}

const exportRows = JSON.parse(fs.readFileSync(EXPORT, "utf8"));
const exportByNorm = new Map();
for (const r of exportRows) {
  const name = String(r.Descricao ?? "").trim();
  if (!name) continue;
  exportByNorm.set(norm(name), r);
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  connect_timeout: 60,
  idle_timeout: 20,
});

try {
  const [tenant] = await sql`select id, name from tenants where slug = ${TENANT} limit 1`;
  if (!tenant) throw new Error(`tenant ${TENANT} não encontrado`);

  const dbProducts = await sql`
    select id, name, stock_qty, min_qty, for_sale, for_internal_use, external_id, price_cents
    from products
    where tenant_id = ${tenant.id} and deleted_at is null
  `;
  const dbByNorm = new Map(dbProducts.map((p) => [norm(p.name), p]));
  const dbByExt = new Map(
    dbProducts.filter((p) => p.external_id).map((p) => [String(p.external_id), p])
  );

  const stats = {
    reportUnique: reportByNorm.size,
    updated: 0,
    inserted: 0,
    forcedSale: [],
    stockSynced: [],
    missingExport: [],
    skipped: [],
  };

  for (const [key, rep] of reportByNorm) {
    const exp = exportByNorm.get(key);
    if (!exp) {
      stats.missingExport.push(rep.name);
      continue;
    }
    const codigo = String(exp.Codigo ?? "").trim();
    const forSale = isForSale(exp);
    const forInternal = isInternalUse(exp);
    const priceCents = parseMoney(exp.Valor);
    const category = String(exp.Categoria ?? "").trim() || null;
    const brand = String(exp.Marca ?? "").trim() || null;

    let db =
      (codigo && dbByExt.get(codigo)) ||
      dbByNorm.get(key) ||
      null;

    if (!db) {
      if (DRY) {
        stats.inserted += 1;
        continue;
      }
      const [row] = await sql`
        insert into products (
          tenant_id, name, category, brand, price_cents, stock_qty, min_qty,
          for_sale, for_internal_use, is_active, external_source, external_id
        ) values (
          ${tenant.id}, ${rep.name.slice(0, 160)}, ${category}, ${brand}, ${priceCents},
          ${rep.stock}, ${rep.min}, ${forSale}, ${forInternal}, true, 'appbarber', ${codigo}
        )
        on conflict (tenant_id, external_source, external_id) do update set
          name = excluded.name,
          stock_qty = excluded.stock_qty,
          min_qty = excluded.min_qty,
          for_sale = excluded.for_sale,
          for_internal_use = excluded.for_internal_use,
          price_cents = excluded.price_cents,
          updated_at = now(),
          deleted_at = null
        returning id, name, for_sale
      `;
      stats.inserted += 1;
      if (forSale) stats.forcedSale.push(row.name);
      continue;
    }

    const needSale = forSale && !db.for_sale;
    const needStock = Number(db.stock_qty) !== rep.stock || Number(db.min_qty) !== rep.min;
    if (!needSale && !needStock && db.for_internal_use === forInternal) {
      stats.skipped.push(rep.name);
      continue;
    }

    if (DRY) {
      stats.updated += 1;
      if (needSale) stats.forcedSale.push(rep.name);
      if (needStock) stats.stockSynced.push({ name: rep.name, from: db.stock_qty, to: rep.stock });
      continue;
    }

    await sql`
      update products set
        name = ${rep.name.slice(0, 160)},
        stock_qty = ${rep.stock},
        min_qty = ${rep.min},
        for_sale = ${forSale},
        for_internal_use = ${forInternal},
        price_cents = ${priceCents || db.price_cents},
        category = coalesce(${category}, category),
        updated_at = now(),
        deleted_at = null
      where id = ${db.id}
    `;
    stats.updated += 1;
    if (needSale) stats.forcedSale.push(rep.name);
    if (needStock) stats.stockSynced.push({ name: rep.name, from: db.stock_qty, to: rep.stock });
  }

  const [after] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where for_sale)::int as for_sale,
      count(*) filter (where not for_sale)::int as not_for_sale
    from products
    where tenant_id = ${tenant.id} and deleted_at is null
  `;

  console.log(
    JSON.stringify(
      {
        dryRun: DRY,
        tenant: tenant.name,
        xlsx: xlsxFile,
        ...stats,
        stockSyncedCount: stats.stockSynced.length,
        stockSyncedSample: stats.stockSynced.slice(0, 25),
        dbAfter: after,
      },
      null,
      2
    )
  );
} finally {
  await sql.end({ timeout: 5 });
}
