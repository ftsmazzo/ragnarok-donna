#!/usr/bin/env node
/**
 * Redefine senha de membros staff (profissionais) do tenant Donna Elegant.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/reset-donna-staff-passwords.mjs
 *   DATABASE_URL=... DONNA_STAFF_PASSWORD=donna12345 node scripts/reset-donna-staff-passwords.mjs
 *
 * Não altera owner/admin/manager — só role=staff (U01 e U02).
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_SLUG = process.env.DONNA_TENANT_SLUG ?? "donna-elegant";
const PASSWORD = process.env.DONNA_STAFF_PASSWORD ?? "donna12345";

if (!DATABASE_URL) {
  console.error("DATABASE_URL obrigatória");
  process.exit(1);
}
if (!PASSWORD || PASSWORD.length < 8) {
  console.error("Senha inválida (mín. 8 caracteres)");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 20 });

try {
  const [tenant] = await sql`
    select id, name, slug from tenants where slug = ${TENANT_SLUG} limit 1
  `;
  if (!tenant) {
    console.error(`Tenant não encontrado: ${TENANT_SLUG}`);
    process.exit(1);
  }

  const members = await sql`
    select u.id, u.email, u.name, m.role, b.slug as branch_slug
    from memberships m
    join users u on u.id = m.user_id
    left join branches b on b.id = m.branch_id
    where m.tenant_id = ${tenant.id}
      and m.role = 'staff'
    order by u.email
  `;

  if (!members.length) {
    console.log("Nenhum membership staff em", TENANT_SLUG);
    process.exit(0);
  }

  const hash = await bcrypt.hash(PASSWORD, 12);
  const ids = members.map((m) => m.id);

  await sql`
    update users
    set password_hash = ${hash}, updated_at = now()
    where id in ${sql(ids)}
  `;

  console.log(`✓ ${members.length} profissionais atualizados em ${tenant.name}`);
  console.log("  Senha:", PASSWORD);
  for (const m of members) {
    console.log(`  - ${m.email} (${m.name})${m.branch_slug ? ` [${m.branch_slug}]` : ""}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
