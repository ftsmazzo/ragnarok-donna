/**
 * Repara vínculos client_id em appointments/orders (pós-import AppBarber).
 *
 * Uso:
 *   DATABASE_URL=... npm run backfill:client-links
 *   DATABASE_URL=... npm run backfill:client-links -- --dir research/export/2026-08-26T14-56-45
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const EXPORT_DIR = arg("--dir", null);
const TENANT_SLUG = arg("--tenant", "ragnaroks");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}

function readJson(name, dir) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [tenant] = await sql`select id from tenants where slug = ${TENANT_SLUG} limit 1`;
  if (!tenant) {
    console.error("Tenant não encontrado:", TENANT_SLUG);
    process.exit(1);
  }
  const tenantId = tenant.id;

  console.log("→ Comandas via Com_Codigo da agenda…");
  const linkedViaAgenda = await sql`
    update orders o
    set client_id = a.client_id, updated_at = now()
    from appointments a
    where o.tenant_id = ${tenantId}
      and a.tenant_id = ${tenantId}
      and o.client_id is null
      and a.client_id is not null
      and a.deleted_at is null
      and o.deleted_at is null
      and o.external_source = 'appbarber'
      and a.external_source = 'appbarber'
      and coalesce(a.meta->>'comCodigo', '') <> ''
      and o.external_id = a.meta->>'comCodigo'
  `;
  console.log("  orders ligadas via agenda:", linkedViaAgenda.count);

  if (EXPORT_DIR && fs.existsSync(EXPORT_DIR)) {
    console.log("→ Re-lendo export:", EXPORT_DIR);

    const clientRows = await sql`
      select id, external_id from clients
      where tenant_id = ${tenantId} and external_source = 'appbarber'
    `;
    const clientMap = new Map(clientRows.map((r) => [String(r.external_id), r.id]));

    const agenda = readJson("agenda", EXPORT_DIR);
    let apptFixed = 0;
    for (const r of agenda) {
      const extId = String(r.id ?? "").trim();
      const cod = String(r.codCliente ?? "").trim();
      if (!extId || !cod || cod === "0") continue;
      const clientId = clientMap.get(cod);
      if (!clientId) continue;
      const res = await sql`
        update appointments
        set client_id = ${clientId},
            meta = meta || ${sql.json({ codCliente: cod })},
            updated_at = now()
        where tenant_id = ${tenantId}
          and external_source = 'appbarber'
          and external_id = ${extId}
          and (client_id is null or client_id <> ${clientId})
      `;
      apptFixed += res.count;
    }
    console.log("  appointments corrigidos do JSON:", apptFixed);

    const comandas = readJson("comandas-historico", EXPORT_DIR);
    let orderFixed = 0;
    for (const r of comandas) {
      const extId = String(r.Codigo ?? "").trim();
      const cod = String(r.CodigoCliente ?? "").trim();
      if (!extId || !cod || cod === "0") continue;
      const clientId = clientMap.get(cod);
      if (!clientId) continue;
      const res = await sql`
        update orders
        set client_id = ${clientId},
            meta = meta || ${sql.json({ appbarberClientCode: cod })},
            updated_at = now()
        where tenant_id = ${tenantId}
          and external_source = 'appbarber'
          and external_id = ${extId}
          and (client_id is null or client_id <> ${clientId})
      `;
      orderFixed += res.count;
    }
    console.log("  orders corrigidos do JSON:", orderFixed);

    // Segunda passada: comandas via agenda após appointments corrigidos
    const linked2 = await sql`
      update orders o
      set client_id = a.client_id, updated_at = now()
      from appointments a
      where o.tenant_id = ${tenantId}
        and a.tenant_id = ${tenantId}
        and o.client_id is null
        and a.client_id is not null
        and a.deleted_at is null
        and o.deleted_at is null
        and o.external_source = 'appbarber'
        and a.external_source = 'appbarber'
        and coalesce(a.meta->>'comCodigo', '') <> ''
        and o.external_id = a.meta->>'comCodigo'
    `;
    console.log("  orders (2ª passada agenda):", linked2.count);
  } else {
    console.log("  (pule re-leitura JSON — passe --dir research/export/... para corrigir 100%)");
  }

  console.log("→ Lista de espera por telefone…");
  const waitlist = await sql`
    update waitlist_entries w
    set client_id = c.id, updated_at = now()
    from clients c
    where w.tenant_id = ${tenantId}
      and c.tenant_id = ${tenantId}
      and w.client_id is null
      and c.phone_e164 is not null
      and w.phone is not null
      and regexp_replace(w.phone, '\\D', '', 'g') = regexp_replace(c.phone_e164, '\\D', '', 'g')
  `;
  console.log("  waitlist ligada:", waitlist.count);

  const [stats] = await sql`
    select
      (select count(*)::int from appointments where tenant_id = ${tenantId} and client_id is not null) as appts_linked,
      (select count(*)::int from appointments where tenant_id = ${tenantId} and client_id is null) as appts_null,
      (select count(*)::int from orders where tenant_id = ${tenantId} and client_id is not null) as orders_linked,
      (select count(*)::int from orders where tenant_id = ${tenantId} and client_id is null) as orders_null
  `;
  console.log("\n✅ Backfill concluído");
  console.log(stats);
} catch (err) {
  console.error("❌ Backfill falhou:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
