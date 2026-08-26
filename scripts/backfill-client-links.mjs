/**
 * Repara vínculos client_id — também roda automaticamente no startup (instrumentation).
 * Uso local: DATABASE_URL=... npm run backfill:client-links
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

const TENANT_SLUG = "ragnaroks";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [tenant] = await sql`select id from tenants where slug = ${TENANT_SLUG} limit 1`;
  if (!tenant) {
    console.error("Tenant não encontrado:", TENANT_SLUG);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const exportDir =
    process.env.APPBARBER_EXPORT_DIR ?? path.join(process.cwd(), "data/appbarber-export");

  if (fs.existsSync(path.join(exportDir, "agenda.json"))) {
    const clientRows = await sql`
      select id, external_id from clients
      where tenant_id = ${tenantId} and external_source = 'appbarber'
    `;
    const clientMap = new Map(clientRows.map((r) => [String(r.external_id), r.id]));

    for (const name of ["agenda", "comandas-historico"]) {
      const rows = JSON.parse(fs.readFileSync(path.join(exportDir, `${name}.json`), "utf8"));
      console.log("→", name, rows.length, "registros");
    }
    console.log("(use deploy automático — bootstrap roda na subida do app)");
  }

  const linked = await sql`
    update orders o set client_id = a.client_id, updated_at = now()
    from appointments a
    where o.tenant_id = ${tenantId} and a.tenant_id = ${tenantId}
      and o.client_id is null and a.client_id is not null
      and coalesce(a.meta->>'comCodigo','') <> '' and o.external_id = a.meta->>'comCodigo'
  `;
  console.log("✓ orders via agenda:", linked.count);
} finally {
  await sql.end();
}
