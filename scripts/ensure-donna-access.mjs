#!/usr/bin/env node
/**
 * Garante tenant Donna Elegant + owner (mesmo da Ragnarok) — rápido, roda no deploy.
 * Import de dados é separado (pode demorar); login funciona antes do import terminar.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL obrigatória");
  process.exit(1);
}

const TENANT_SLUG = "donna-elegant";
const FROM_TENANT = process.env.DONNA_OWNER_FROM_TENANT ?? "ragnaroks";

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  let [tenant] = await sql`
    select id, name from tenants where slug = ${TENANT_SLUG} limit 1
  `;

  if (!tenant) {
    [tenant] = await sql`
      insert into tenants (name, slug, plan_code, status)
      values ('Donna Elegant', ${TENANT_SLUG}, 'network', 'active')
      returning id, name
    `;
    console.log("✓ Tenant criado:", TENANT_SLUG);
  }

  await sql`
    insert into branches (tenant_id, name, slug, address, is_active, external_source, external_id)
    values
      (${tenant.id}, 'Donna Elegant — Unidade 01', 'unidade-01', 'Rua Curitiba, 486 — Catanduva-SP', true, 'donna', 'unidade-01'),
      (${tenant.id}, 'Donna Elegant — Unidade 02', 'unidade-02', 'Endereço a definir — Catanduva-SP', true, 'donna', 'unidade-02')
    on conflict (tenant_id, slug) do update set
      name = excluded.name,
      address = excluded.address,
      updated_at = now()
  `;

  const [agent] = await sql`
    select id from agent_profiles where tenant_id = ${tenant.id} and is_default = true limit 1
  `;
  if (!agent) {
    await sql`
      insert into agent_profiles (tenant_id, name, display_name, system_prompt, is_default, is_active)
      values (${tenant.id}, 'donna', 'Donna', '', true, true)
    `;
  }

  const [owner] = await sql`
    select u.id, u.email
    from users u
    join memberships m on m.user_id = u.id
    join tenants t on t.id = m.tenant_id
    where t.slug = ${FROM_TENANT} and m.role = 'owner'
    order by u.created_at
    limit 1
  `;

  if (!owner) {
    console.error(`Nenhum owner em ${FROM_TENANT} — não foi possível vincular Donna.`);
    process.exit(1);
  }

  await sql`
    insert into memberships (tenant_id, user_id, role)
    values (${tenant.id}, ${owner.id}, 'owner')
    on conflict (tenant_id, user_id) do update set role = 'owner', updated_at = now()
  `;

  await sql`
    update tenants set status = 'active', plan_code = 'network', updated_at = now()
    where id = ${tenant.id}
  `;

  console.log("✓ Donna Elegant pronta para login");
  console.log("  Owner:", owner.email);
} finally {
  await sql.end();
}
