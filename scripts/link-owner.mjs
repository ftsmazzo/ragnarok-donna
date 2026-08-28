#!/usr/bin/env node
/**
 * Vincula um usuário existente como owner de um tenant (sem alterar senha).
 *
 * Uso:
 *   node scripts/link-owner.mjs --tenant donna-elegant
 *   node scripts/link-owner.mjs --tenant donna-elegant --email admin@exemplo.com
 *   node scripts/link-owner.mjs --tenant donna-elegant --from-tenant ragnaroks
 */
import postgres from "postgres";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_SLUG = arg("--tenant");
const FROM_TENANT = arg("--from-tenant", "ragnaroks");
const EMAIL = arg("--email");

if (!DATABASE_URL || !TENANT_SLUG) {
  console.error("Uso: DATABASE_URL=... node scripts/link-owner.mjs --tenant <slug> [--email ...] [--from-tenant ragnaroks]");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [tenant] = await sql`select id, name from tenants where slug = ${TENANT_SLUG} limit 1`;
  if (!tenant) {
    console.error(`Tenant não encontrado: ${TENANT_SLUG}`);
    process.exit(1);
  }

  let userEmail = EMAIL?.toLowerCase();
  if (!userEmail) {
    const [owner] = await sql`
      select u.email
      from users u
      join memberships m on m.user_id = u.id
      join tenants t on t.id = m.tenant_id
      where t.slug = ${FROM_TENANT} and m.role = 'owner'
      limit 1
    `;
    if (!owner) {
      console.error(`Nenhum owner em ${FROM_TENANT}. Passe --email.`);
      process.exit(1);
    }
    userEmail = owner.email;
  }

  const [user] = await sql`
    select id, email, name from users where email = ${userEmail} and deleted_at is null limit 1
  `;
  if (!user) {
    console.error(`Usuário não encontrado: ${userEmail}`);
    process.exit(1);
  }

  await sql`
    insert into memberships (tenant_id, user_id, role)
    values (${tenant.id}, ${user.id}, 'owner')
    on conflict (tenant_id, user_id) do update set role = 'owner', updated_at = now()
  `;

  await sql`update tenants set status = 'active', updated_at = now() where id = ${tenant.id}`;

  console.log("✓ Owner vinculado");
  console.log("  Tenant:", tenant.name, `(${TENANT_SLUG})`);
  console.log("  Usuário:", user.email);
} finally {
  await sql.end();
}
