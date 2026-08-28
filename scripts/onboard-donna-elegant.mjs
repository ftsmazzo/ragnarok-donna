#!/usr/bin/env node
/**
 * Onboarding Donna Elegant — import AppBeleza + unidade 02 vazia + owner + perfil.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/onboard-donna-elegant.mjs --dir research/export/2026-08-28T13-51-26
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const EXPORT_DIR = arg(
  "--dir",
  "research/export/2026-08-28T13-51-26"
);
const DATABASE_URL = process.env.DATABASE_URL;
const SKIP_IMPORT = args.includes("--skip-import");

if (!DATABASE_URL) {
  console.error("DATABASE_URL obrigatória");
  process.exit(1);
}

const TENANT_SLUG = "donna-elegant";
const BRANCH_01 = {
  slug: "unidade-01",
  name: "Donna Elegant — Unidade 01",
  address: "Rua Curitiba, 486 — Catanduva-SP",
};
const BRANCH_02 = {
  slug: "unidade-02",
  name: "Donna Elegant — Unidade 02",
  address: "Endereço a definir — Catanduva-SP",
};

if (!SKIP_IMPORT) {
  console.log("→ Import AppBeleza…");
  const imp = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts/import-appbarber.mjs"),
      "--tenant",
      TENANT_SLUG,
      "--name",
      "Donna Elegant",
      "--dir",
      path.join(ROOT, EXPORT_DIR),
      "--source",
      "appbeleza",
      "--branch-slug",
      BRANCH_01.slug,
      "--branch-name",
      BRANCH_01.name,
      "--branch-address",
      BRANCH_01.address,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL },
    }
  );
  if (imp.status !== 0) process.exit(imp.status ?? 1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [tenant] = await sql`select id from tenants where slug = ${TENANT_SLUG} limit 1`;
  if (!tenant) {
    console.error("Tenant donna-elegant não encontrado após import");
    process.exit(1);
  }

  console.log("→ Unidade 02 (nova)…");
  await sql`
    insert into branches (tenant_id, name, slug, address, is_active, external_source, external_id)
    values (
      ${tenant.id},
      ${BRANCH_02.name},
      ${BRANCH_02.slug},
      ${BRANCH_02.address},
      true,
      'donna',
      'unidade-02'
    )
    on conflict (tenant_id, slug) do update set
      name = excluded.name,
      address = excluded.address,
      updated_at = now()
  `;

  console.log("→ Plano network (multi-unidade)…");
  await sql`
    update tenants set plan_code = 'network', updated_at = now() where id = ${tenant.id}
  `;

  console.log("→ Agente Donna (perfil padrão)…");
  const [agent] = await sql`
    select id from agent_profiles where tenant_id = ${tenant.id} and is_default = true limit 1
  `;
  if (!agent) {
    await sql`
      insert into agent_profiles (tenant_id, name, display_name, system_prompt, is_default, is_active)
      values (${tenant.id}, 'donna', 'Donna', '', true, true)
    `;
  }

  console.log("→ Vincular owner (mesmo da Ragnarok)…");
  const link = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts/link-owner.mjs"),
      "--tenant",
      TENANT_SLUG,
      "--from-tenant",
      "ragnaroks",
    ],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, DATABASE_URL } }
  );
  if (link.status !== 0) process.exit(link.status ?? 1);

  console.log("\n✓ Donna Elegant onboard concluído");
  console.log("  Tenant:", TENANT_SLUG);
  console.log("  Unidades:", BRANCH_01.slug, "+", BRANCH_02.slug);
  console.log("  Login: mesmo e-mail/senha da Ragnarok → escolha organização no login");
} finally {
  await sql.end();
}
