/**
 * Diagnóstico: isolamento clientes Donna vs Ragnarok.
 * Roda no deploy/ops: DATABASE_URL=... node scripts/audit-tenant-clients.mjs
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL obrigatória");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 20 });

try {
  const tenants = await sql`
    select id, slug, name from tenants
    where slug in ('ragnaroks', 'donna-elegant') or name ilike '%donna%' or name ilike '%ragnarok%'
    order by slug
  `;
  console.log("tenants:", tenants);

  for (const t of tenants) {
    const [c] = await sql`
      select count(*)::int as n from clients where tenant_id = ${t.id} and deleted_at is null
    `;
    const [bySrc] = await sql`
      select coalesce(external_source, '(null)') as src, count(*)::int as n
      from clients where tenant_id = ${t.id} and deleted_at is null
      group by 1 order by n desc
    `;
    const branches = await sql`
      select slug, name from branches where tenant_id = ${t.id} and deleted_at is null order by slug
    `;
    console.log(`\n=== ${t.slug} (${t.name}) clients=${c.n} ===`);
    console.log("branches:", branches);
    console.log("by source:", bySrc);
  }

  const orphans = await sql`
    select 'appointments' as tbl, count(*)::int as n
    from appointments a join clients c on c.id = a.client_id
    where a.tenant_id <> c.tenant_id
    union all
    select 'orders', count(*)::int
    from orders o join clients c on c.id = o.client_id
    where o.tenant_id <> c.tenant_id and o.client_id is not null
  `;
  console.log("\ncross-tenant orphans:", orphans);

  const overlapPhones = await sql`
    select count(*)::int as shared_phones
    from clients d
    join clients r on r.phone_e164 is not null and r.phone_e164 = d.phone_e164
    join tenants td on td.id = d.tenant_id and td.slug = 'donna-elegant'
    join tenants tr on tr.id = r.tenant_id and tr.slug = 'ragnaroks'
    where d.deleted_at is null and r.deleted_at is null
  `;
  console.log("same phone_e164 in both tenants:", overlapPhones);

  const sampleDonna = await sql`
    select c.name, c.phone, c.external_source
    from clients c
    join tenants t on t.id = c.tenant_id and t.slug = 'donna-elegant'
    where c.deleted_at is null
    order by c.created_at desc
    limit 8
  `;
  console.log("sample donna clients:", sampleDonna);
} finally {
  await sql.end({ timeout: 5 });
}
