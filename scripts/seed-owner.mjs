#!/usr/bin/env node
/**
 * Cria usuário owner para o tenant RagnaroK (Sprint 0).
 *
 * Uso:
 *   SEED_OWNER_EMAIL=... SEED_OWNER_PASSWORD=... npm run seed:owner
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const EMAIL = (process.env.SEED_OWNER_EMAIL ?? "admin@ragnaroks.local").toLowerCase();
const PASSWORD = process.env.SEED_OWNER_PASSWORD;
const NAME = process.env.SEED_OWNER_NAME ?? "Administrador";
const TENANT_SLUG = "ragnaroks";

if (!DATABASE_URL) {
  console.error("DATABASE_URL obrigatória");
  process.exit(1);
}
if (!PASSWORD || PASSWORD.length < 8) {
  console.error("SEED_OWNER_PASSWORD obrigatória (mín. 8 caracteres)");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [tenant] = await sql`
    select id, name from tenants where slug = ${TENANT_SLUG} limit 1
  `;
  if (!tenant) {
    console.error(`Tenant não encontrado: ${TENANT_SLUG}. Rode import:appbarber antes.`);
    process.exit(1);
  }

  await sql`
    update tenants set status = 'active', updated_at = now() where id = ${tenant.id}
  `;

  const hash = await bcrypt.hash(PASSWORD, 12);

  const [user] = await sql`
    insert into users (name, email, password_hash)
    values (${NAME}, ${EMAIL}, ${hash})
    on conflict (email) do update set
      name = excluded.name,
      password_hash = excluded.password_hash,
      updated_at = now()
    returning id, email
  `;

  await sql`
    insert into memberships (tenant_id, user_id, role)
    values (${tenant.id}, ${user.id}, 'owner')
    on conflict (tenant_id, user_id) do update set role = 'owner', updated_at = now()
  `;

  console.log("✓ Owner criado/atualizado");
  console.log("  Tenant:", tenant.name, `(${TENANT_SLUG})`);
  console.log("  E-mail:", user.email);
  console.log("  Papel: owner");
} finally {
  await sql.end();
}
