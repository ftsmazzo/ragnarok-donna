/**
 * Startup de produção: garante o schema obrigatório, sobe o Next.js e executa
 * importações/reparos não críticos em background.
 * Roda no deploy (npm start / Docker) — sem terminal no EasyPanel.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TENANT_SLUG = "ragnaroks";
const DONNA_SLUG = "donna-elegant";
const LOCK_KEY = 8347291;
const DONNA_LOCK_KEY = 8347292;
const JSON_BOOTSTRAP_VERSION = 1;
const BOOTSTRAP_TIMEOUT_MS = 120_000;
const DONNA_BOOTSTRAP_TIMEOUT_MS = 1_800_000;

function exportDir() {
  const dir =
    process.env.APPBARBER_EXPORT_DIR ?? path.join(ROOT, "data/appbarber-export");
  if (!fs.existsSync(path.join(dir, "agenda.json"))) return null;
  return dir;
}

function donnaExportDir() {
  const dir =
    process.env.DONNA_EXPORT_DIR ?? path.join(ROOT, "data/donna-elegant-export");
  if (!fs.existsSync(path.join(dir, "clientes.json"))) return null;
  return dir;
}

function spawnOnboard(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`onboard exit ${code}`));
    });
  });
}

function spawnScript(scriptName, extraArgs = []) {
  return spawnOnboard([path.join(ROOT, "scripts", scriptName), ...extraArgs]);
}

function spawnScriptDetached(scriptName, extraArgs = []) {
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "scripts", scriptName), ...extraArgs],
    {
      cwd: ROOT,
      env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=2048" },
      detached: true,
      stdio: "inherit",
    }
  );
  child.unref();
  return child;
}

async function runDonnaBootstrap(sql) {
  const [{ ok: locked }] = await sql`select pg_try_advisory_lock(${DONNA_LOCK_KEY}) as ok`;
  if (!locked) {
    console.log("[bootstrap:donna] outro processo em execução.");
    return;
  }

  try {
    const dir = donnaExportDir();
    if (!dir) {
      console.log("[bootstrap:donna] pasta data/donna-elegant-export ausente — import pulado.");
      return;
    }

    const [existing] = await sql`
      select t.id, (select count(*)::int from clients c where c.tenant_id = t.id) as clients
      from tenants t where t.slug = ${DONNA_SLUG} limit 1
    `;
    if (existing?.clients > 100) {
      console.log("[bootstrap:donna] dados já importados —", existing.clients, "clientes.");
      return;
    }

    if (!existing?.id) {
      console.log("[bootstrap:donna] tenant donna-elegant ainda não existe — import pulado.");
      return;
    }

    const [running] = await sql`
      select id from import_runs
      where tenant_id = ${existing.id}
        and status = 'running'
        and started_at > now() - interval '3 hours'
      limit 1
    `;
    if (running) {
      console.log("[bootstrap:donna] import já em execução — aguardando.");
      return;
    }

    console.log("[bootstrap:donna] import AppBeleza (background)…");
    spawnScriptDetached("import-appbarber.mjs", [
      "--tenant",
      DONNA_SLUG,
      "--name",
      "Donna Elegant",
      "--dir",
      dir,
      "--source",
      "appbeleza",
      "--branch-slug",
      "unidade-01",
      "--branch-name",
      "Donna Elegant — Unidade 01",
      "--branch-address",
      "Rua Curitiba, 486 — Catanduva-SP",
    ]);
    console.log("[bootstrap:donna] import disparado em background.");
  } catch (err) {
    console.error("[bootstrap:donna] falhou:", err);
  } finally {
    await sql`select pg_advisory_unlock(${DONNA_LOCK_KEY})`.catch(() => {});
  }
}

function readJson(name, dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
}

function resolveServer() {
  const candidates = [
    { file: path.join(ROOT, "server.js"), cwd: ROOT },
    { file: path.join(ROOT, ".next/standalone/server.js"), cwd: path.join(ROOT, ".next/standalone") },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.file)) return c;
  }
  return null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`bootstrap timeout (${ms}ms)`)), ms)
    ),
  ]);
}

async function runBootstrap() {
  if (process.env.SKIP_DEPLOY_BOOTSTRAP === "1") return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[bootstrap] DATABASE_URL ausente — pulando.");
    return;
  }

  let postgres;
  try {
    postgres = (await import("postgres")).default;
  } catch (err) {
    console.warn("[bootstrap] módulo postgres indisponível — pulando.", err);
    return;
  }

  const sql = postgres(dbUrl, {
    max: 1,
    connect_timeout: 10,
    // Evita flood de NOTICE "already exists, skipping" no log do EasyPanel.
    onnotice: () => {},
  });

  try {
    await sql.unsafe(`
DO $$ BEGIN
  CREATE TYPE staff_advance_kind AS ENUM ('vale', 'bonus', 'discount', 'payout');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE staff_advance_status AS ENUM ('open', 'settled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS staff_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  kind staff_advance_kind NOT NULL,
  status staff_advance_status NOT NULL DEFAULT 'open',
  amount_cents integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes varchar(240),
  cash_movement_id uuid REFERENCES cash_movements(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_advances_tenant_staff_idx ON staff_advances (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS staff_advances_tenant_occurred_idx ON staff_advances (tenant_id, occurred_at);

CREATE TABLE IF NOT EXISTS outreach_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  phone_e164 varchar(20) NOT NULL,
  kind varchar(40) NOT NULL DEFAULT 'followup_inactive',
  body text NOT NULL DEFAULT '',
  status varchar(24) NOT NULL DEFAULT 'pending',
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  error_message varchar(400),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_jobs_tenant_status_sched_idx
  ON outreach_jobs (tenant_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS outreach_jobs_tenant_client_idx
  ON outreach_jobs (tenant_id, client_id);

ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS persona jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS memberships_branch_idx ON memberships (branch_id);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS package_id uuid;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS commission_bps integer;

ALTER TABLE services ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS services_tenant_branch_idx ON services (tenant_id, branch_id);

ALTER TABLE client_package_credits ALTER COLUMN service_id DROP NOT NULL;
ALTER TABLE client_package_credits ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS client_package_credits_product_idx ON client_package_credits (tenant_id, product_id);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status varchar(24) NOT NULL DEFAULT 'pending';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS replied_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_wa_delivery_idx ON messages (wa_message_id, delivery_status);

CREATE TABLE IF NOT EXISTS staff_extras_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  monthly_target_cents integer NOT NULL DEFAULT 0,
  monthly_target_qty integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_extras_goals_tenant_staff_uidx
  ON staff_extras_goals (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS staff_extras_goals_tenant_idx
  ON staff_extras_goals (tenant_id);

DO $$ BEGIN
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'pix_key';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'rede_link';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'infinity';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'client_account';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_balance_cents integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS client_account_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  delta_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  reason varchar(64) NOT NULL,
  notes varchar(240),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_account_ledger_client_idx
  ON client_account_ledger (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS client_account_ledger_created_idx
  ON client_account_ledger (tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS client_account_ledger_payment_uidx
  ON client_account_ledger (payment_id)
  WHERE payment_id IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE client_account_ledger
    ADD CONSTRAINT client_account_ledger_delta_nonzero_chk CHECK (delta_cents <> 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta_qty integer NOT NULL,
  qty_after integer NOT NULL,
  reason varchar(64) NOT NULL,
  notes varchar(240),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON stock_movements (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx
  ON stock_movements (tenant_id, created_at);
DO $$ BEGIN
  ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_delta_nonzero_chk CHECK (delta_qty <> 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS client_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id uuid,
  name varchar(160) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'active',
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  external_source varchar(40),
  external_id varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_packages_client_idx ON client_packages (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS client_packages_status_idx ON client_packages (tenant_id, status);
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS external_source varchar(40);
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS external_id varchar(80);
CREATE UNIQUE INDEX IF NOT EXISTS client_packages_tenant_ext_uidx
  ON client_packages (tenant_id, external_source, external_id);

CREATE TABLE IF NOT EXISTS client_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  status varchar(24) NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  notes text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_subscriptions_client_idx ON client_subscriptions (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS client_subscriptions_status_idx ON client_subscriptions (tenant_id, status);

CREATE TABLE IF NOT EXISTS client_package_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_package_id uuid NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  total_qty integer NOT NULL DEFAULT 1,
  remaining_qty integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_package_credits_pkg_idx ON client_package_credits (client_package_id);
CREATE INDEX IF NOT EXISTS client_package_credits_service_idx ON client_package_credits (tenant_id, service_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent varchar(400),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uidx ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_tenant_idx ON push_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status varchar(16) NOT NULL DEFAULT 'ai',
  last_message_at timestamptz,
  human_requested_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_threads_tenant_idx ON support_threads (tenant_id);
CREATE INDEX IF NOT EXISTS support_threads_tenant_status_idx ON support_threads (tenant_id, status);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  role varchar(24) NOT NULL,
  body text NOT NULL DEFAULT '',
  request_id varchar(80),
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS request_id varchar(80);
CREATE INDEX IF NOT EXISTS support_messages_thread_created_idx
  ON support_messages (thread_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS support_messages_thread_request_role_uidx
  ON support_messages (thread_id, request_id, role);

-- Consolida threads duplicadas antes de impor uma conversa por usuário/unidade.
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY tenant_id, user_id
      ORDER BY updated_at DESC, id DESC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY tenant_id, user_id
      ORDER BY updated_at DESC, id DESC
    ) AS rn
  FROM support_threads
  WHERE user_id IS NOT NULL
)
UPDATE support_messages AS message
SET thread_id = ranked.keep_id
FROM ranked
WHERE ranked.rn > 1 AND message.thread_id = ranked.id;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, user_id
      ORDER BY updated_at DESC, id DESC
    ) AS rn
  FROM support_threads
  WHERE user_id IS NOT NULL
)
DELETE FROM support_threads AS thread
USING ranked
WHERE ranked.rn > 1 AND thread.id = ranked.id;

DROP INDEX IF EXISTS support_threads_tenant_user_idx;
CREATE UNIQUE INDEX IF NOT EXISTS support_threads_tenant_user_uidx
  ON support_threads (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS tenant_outreach_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  confirmation_enabled boolean NOT NULL DEFAULT false,
  followup30_enabled boolean NOT NULL DEFAULT false,
  followup60_enabled boolean NOT NULL DEFAULT false,
  sunday_blast_enabled boolean NOT NULL DEFAULT false,
  empty_agenda_enabled boolean NOT NULL DEFAULT false,
  sound_on_confirm_enabled boolean NOT NULL DEFAULT false,
  confirmation_send_time varchar(5) NOT NULL DEFAULT '18:00',
  skip_sundays boolean NOT NULL DEFAULT true,
  skip_holidays boolean NOT NULL DEFAULT true,
  custom_closed_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  followup_month_days jsonb NOT NULL DEFAULT '[5,6,10,11,20,21]'::jsonb,
  followup30_days integer NOT NULL DEFAULT 30,
  followup60_days integer NOT NULL DEFAULT 60,
  blast_active_within_days integer NOT NULL DEFAULT 120,
  template_confirmation text NOT NULL DEFAULT '',
  template_followup30 text NOT NULL DEFAULT '',
  template_followup60 text NOT NULL DEFAULT '',
  template_sunday_blast text NOT NULL DEFAULT '',
  template_empty_agenda text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_outreach_settings_tenant_uidx
  ON tenant_outreach_settings (tenant_id);
ALTER TABLE tenant_outreach_settings
  ADD COLUMN IF NOT EXISTS birthday_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenant_outreach_settings
  ADD COLUMN IF NOT EXISTS birthday_discount_pct integer NOT NULL DEFAULT 10;
ALTER TABLE tenant_outreach_settings
  ADD COLUMN IF NOT EXISTS template_birthday text NOT NULL DEFAULT '';
`);
    console.log(
      "[bootstrap] schema staff_advances + client_account + outreach + support_* + agent_profiles.persona ok"
    );

    const [{ ok: locked }] = await sql`select pg_try_advisory_lock(${LOCK_KEY}) as ok`;
    if (!locked) {
      console.log("[bootstrap] outro processo em execução, pulando.");
      return;
    }

    const [tenant] = await sql`select id from tenants where slug = ${TENANT_SLUG} limit 1`;
    if (!tenant) {
      console.log("[bootstrap] tenant não encontrado, pulando.");
      return;
    }

    const tenantId = tenant.id;

    const SQL_LINK_LABEL = "bootstrap:client-links-sql:v1";
    const [sqlLinksDone] = await sql`
      select id from import_runs
      where tenant_id = ${tenantId} and label = ${SQL_LINK_LABEL} and status = 'completed'
      limit 1
    `;

    if (sqlLinksDone) {
      console.log("[bootstrap] vínculos SQL já concluídos — pulando scans pesados.");
    } else {
      const [precheck] = await sql`
        select
          (select count(*)::int from appointments where tenant_id = ${tenantId} and client_id is not null) as appts_linked,
          (select count(*)::int from orders where tenant_id = ${tenantId} and client_id is not null) as orders_linked
      `;

      if (precheck.appts_linked > 5000 && precheck.orders_linked > 5000) {
        await sql`
          insert into import_runs (tenant_id, source, status, label, started_at, finished_at, stats)
          values (
            ${tenantId},
            'appbarber',
            'completed',
            ${SQL_LINK_LABEL},
            now(),
            now(),
            ${sql.json({ linked: 0, skippedRescan: true, ...precheck })}
          )
        `;
        console.log("[bootstrap] vínculos já presentes — marcando concluído.", precheck);
      } else {
      console.log("[bootstrap] vinculando clientes ↔ agenda ↔ comandas (background)…");

      const dir = exportDir();
      if (dir) {
        const label = `bootstrap:client-links-json:v${JSON_BOOTSTRAP_VERSION}`;
        const [done] = await sql`
          select id from import_runs
          where tenant_id = ${tenantId} and label = ${label} and status = 'completed'
          limit 1
        `;
        if (!done) {
          const clientRows = await sql`
            select id, external_id from clients
            where tenant_id = ${tenantId} and external_source = 'appbarber'
          `;
          const clientMap = new Map(clientRows.map((r) => [String(r.external_id), r.id]));
          let apptFix = 0;
          let orderFix = 0;

          for (const r of readJson("agenda", dir)) {
            const extId = String(r.id ?? "").trim();
            const cod = String(r.codCliente ?? "").trim();
            if (!extId || !cod || cod === "0") continue;
            const clientId = clientMap.get(cod);
            if (!clientId) continue;
            const res = await sql`
              update appointments
              set client_id = ${clientId},
                  meta = coalesce(meta, '{}'::jsonb) || ${sql.json({ codCliente: cod })},
                  updated_at = now()
              where tenant_id = ${tenantId} and external_source = 'appbarber' and external_id = ${extId}
                and (client_id is null or client_id <> ${clientId})
            `;
            apptFix += res.count;
          }

          for (const r of readJson("comandas-historico", dir)) {
            const extId = String(r.Codigo ?? "").trim();
            const cod = String(r.CodigoCliente ?? "").trim();
            if (!extId || !cod || cod === "0") continue;
            const clientId = clientMap.get(cod);
            if (!clientId) continue;
            const res = await sql`
              update orders
              set client_id = ${clientId},
                  meta = coalesce(meta, '{}'::jsonb) || ${sql.json({ appbarberClientCode: cod })},
                  updated_at = now()
              where tenant_id = ${tenantId} and external_source = 'appbarber' and external_id = ${extId}
                and (client_id is null or client_id <> ${clientId})
            `;
            orderFix += res.count;
          }

          await sql`
            insert into import_runs (tenant_id, source, status, label, started_at, finished_at, stats)
            values (${tenantId}, 'appbarber', 'completed', ${label}, now(), now(), ${sql.json({ apptFix, orderFix })})
          `;
          console.log("[bootstrap] JSON:", { apptFix, orderFix });
        }
      }

      const steps = [
        sql`
          update orders o set client_id = a.client_id, updated_at = now()
          from appointments a
          where o.tenant_id = ${tenantId} and a.tenant_id = ${tenantId}
            and o.client_id is null and a.client_id is not null
            and a.deleted_at is null and o.deleted_at is null
            and o.external_source = 'appbarber' and a.external_source = 'appbarber'
            and coalesce(a.meta->>'comCodigo','') <> '' and o.external_id = a.meta->>'comCodigo'
        `,
        sql`
          update appointments a set client_id = o.client_id, updated_at = now()
          from orders o
          where a.tenant_id = ${tenantId} and o.tenant_id = ${tenantId}
            and a.client_id is null and o.client_id is not null
            and a.deleted_at is null and o.deleted_at is null
            and a.external_source = 'appbarber' and o.external_source = 'appbarber'
            and coalesce(a.meta->>'comCodigo','') <> '' and a.meta->>'comCodigo' = o.external_id
        `,
        sql`
          update orders o set client_id = c.id, updated_at = now()
          from clients c
          where o.tenant_id = ${tenantId} and c.tenant_id = ${tenantId}
            and o.client_id is null and o.deleted_at is null
            and o.external_source = 'appbarber' and c.external_source = 'appbarber'
            and coalesce(o.meta->>'appbarberClientCode','') <> ''
            and o.meta->>'appbarberClientCode' = c.external_id
        `,
        sql`
          update appointments a set client_id = c.id, updated_at = now()
          from clients c
          where a.tenant_id = ${tenantId} and c.tenant_id = ${tenantId}
            and a.client_id is null and a.deleted_at is null
            and a.external_source = 'appbarber' and c.external_source = 'appbarber'
            and coalesce(a.meta->>'codCliente','') <> '' and a.meta->>'codCliente' = c.external_id
        `,
        sql`
          update waitlist_entries w set client_id = c.id, updated_at = now()
          from clients c
          where w.tenant_id = ${tenantId} and c.tenant_id = ${tenantId}
            and w.client_id is null and c.phone_e164 is not null and w.phone is not null
            and regexp_replace(w.phone, '\\D', '', 'g') = regexp_replace(c.phone_e164, '\\D', '', 'g')
        `,
      ];

      let linked = 0;
      for (const step of steps) {
        const res = await step;
        linked += res.count;
      }

      const [stats] = await sql`
        select
          (select count(*)::int from appointments where tenant_id = ${tenantId} and client_id is not null) as appts_linked,
          (select count(*)::int from orders where tenant_id = ${tenantId} and client_id is not null) as orders_linked
      `;

      await sql`
        insert into import_runs (tenant_id, source, status, label, started_at, finished_at, stats)
        values (
          ${tenantId},
          'appbarber',
          'completed',
          ${SQL_LINK_LABEL},
          now(),
          now(),
          ${sql.json({ linked, ...stats })}
        )
      `;
      console.log("[bootstrap] concluído.", { linked, ...stats });
    }
    }
  } catch (err) {
    console.error("[bootstrap] falhou:", err);
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

async function ensureRequiredAccountSchema() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada");
  }
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql`ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'client_account'`;
    await sql`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS account_balance_cents integer NOT NULL DEFAULT 0
    `;
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS client_account_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        delta_cents integer NOT NULL,
        balance_after_cents integer NOT NULL,
        reason varchar(64) NOT NULL,
        notes varchar(240),
        order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS client_account_ledger_client_idx
        ON client_account_ledger (tenant_id, client_id)
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS client_account_ledger_created_idx
        ON client_account_ledger (tenant_id, created_at)
    `);
    await sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS client_account_ledger_payment_uidx
        ON client_account_ledger (payment_id)
        WHERE payment_id IS NOT NULL
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        delta_qty integer NOT NULL,
        qty_after integer NOT NULL,
        reason varchar(64) NOT NULL,
        notes varchar(240),
        order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS stock_movements_product_idx
        ON stock_movements (tenant_id, product_id)
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS stock_movements_created_idx
        ON stock_movements (tenant_id, created_at)
    `);
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS birthday_enabled boolean NOT NULL DEFAULT false
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS birthday_discount_pct integer NOT NULL DEFAULT 10
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS template_birthday text NOT NULL DEFAULT ''
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS template_confirmation_variants jsonb NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS template_followup30_variants jsonb NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS template_followup60_variants jsonb NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS template_sunday_blast_variants jsonb NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS template_empty_agenda_variants jsonb NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS template_birthday_variants jsonb NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS daily_cap integer NOT NULL DEFAULT 100
    `;
    await sql`
      ALTER TABLE tenant_outreach_settings
      ADD COLUMN IF NOT EXISTS dry_run_enabled boolean NOT NULL DEFAULT true
    `;

    await ensureTreasurySchema(sql);

    // Agendamentos antigos sem unidade: herdam branch do profissional (multi-unidade Donna).
    await sql.unsafe(`
UPDATE appointments a
SET branch_id = s.branch_id,
    updated_at = now()
FROM staff s
WHERE a.staff_id = s.id
  AND a.branch_id IS NULL
  AND s.branch_id IS NOT NULL
  AND a.deleted_at IS NULL
`);
    console.log("[bootstrap] appointments.branch_id backfill from staff ok");

    // Isolamento de marca (#168): branches da Ragnarok não podem se chamar "Donna Elegant".
    // Bug legado: ensureBusinessProfile renomeava qualquer slug unidade-01 para Donna.
    const repairedBranches = await sql`
      UPDATE branches b
      SET
        name = CASE
          WHEN b.slug = 'unidade-01' THEN 'Unidade 01'
          WHEN b.slug = 'unidade-02' THEN 'Unidade 02'
          ELSE regexp_replace(b.name, '^Donna Elegant —\\s*', '')
        END,
        updated_at = now()
      FROM tenants t
      WHERE b.tenant_id = t.id
        AND t.slug = 'ragnaroks'
        AND b.name ILIKE '%Donna Elegant%'
        AND b.deleted_at IS NULL
      RETURNING b.id, b.slug, b.name
    `;
    if (repairedBranches.length) {
      console.log(
        "[bootstrap] branches Ragnarok desalinhadas corrigidas:",
        repairedBranches.map((r) => `${r.slug}→${r.name}`).join(", ")
      );
    }

    // Log de sanidade: clientes por tenant (sem misturar bases).
    const clientCounts = await sql`
      SELECT t.slug, count(c.id)::int AS n,
        count(*) FILTER (WHERE c.external_source = 'appbarber')::int AS appbarber,
        count(*) FILTER (WHERE c.external_source = 'appbeleza')::int AS appbeleza
      FROM tenants t
      LEFT JOIN clients c ON c.tenant_id = t.id AND c.deleted_at IS NULL
      WHERE t.slug IN ('ragnaroks', 'donna-elegant')
      GROUP BY t.slug
      ORDER BY t.slug
    `;
    console.log("[bootstrap] clients por tenant:", clientCounts);

    const crossTenant = await sql`
      SELECT count(*)::int AS n
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      WHERE a.tenant_id <> c.tenant_id
        AND a.deleted_at IS NULL
    `;
    if (crossTenant[0]?.n > 0) {
      console.warn(
        "[bootstrap] ALERTA: appointments com client de outro tenant:",
        crossTenant[0].n
      );
      // Desvincula referência cruzada (mantém o agendamento; cliente some do join isolado).
      await sql`
        UPDATE appointments a
        SET client_id = NULL, updated_at = now()
        FROM clients c
        WHERE a.client_id = c.id
          AND a.tenant_id <> c.tenant_id
          AND a.deleted_at IS NULL
      `;
      console.log("[bootstrap] appointments cross-tenant: client_id anulado");
    }

    // Settings poluído: perfil Donna dentro do tenant Ragnarok (ou vice-versa).
    const polluted = await sql`
      SELECT t.id, t.slug, t.settings->>'businessProfile' IS NOT NULL AS has_profile,
        t.settings->'businessProfile'->>'nomeFantasia' AS nome
      FROM tenants t
      WHERE t.slug IN ('ragnaroks', 'donna-elegant')
        AND t.settings ? 'businessProfile'
        AND (
          (t.slug = 'ragnaroks' AND (t.settings->'businessProfile'->>'nomeFantasia') ILIKE '%donna%')
          OR (t.slug = 'donna-elegant' AND (t.settings->'businessProfile'->>'nomeFantasia') ILIKE '%ragnarok%')
        )
    `;
    for (const row of polluted) {
      await sql`
        UPDATE tenants
        SET settings = settings - 'businessProfile' - 'branding',
            updated_at = now()
        WHERE id = ${row.id}
      `;
      console.log(
        `[bootstrap] settings poluído removido em ${row.slug} (era nome=${row.nome}) — reseed no próximo ensure`
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Schema do módulo Tesouraria — criado no start do EasyPanel (sem db:push manual). */
async function ensureTreasurySchema(sql) {
  await sql.unsafe(`
DO $$ BEGIN
  CREATE TYPE bank_account_type AS ENUM ('checking', 'savings', 'internal', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE finance_direction AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE finance_recurrence AS ENUM ('none', 'weekly', 'biweekly', 'monthly', 'bimonthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chart_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code varchar(32) NOT NULL,
  name varchar(200) NOT NULL,
  synthetic_name varchar(200),
  dfc_group_1 varchar(120),
  dfc_group_2 varchar(120),
  dre_group_1 varchar(120),
  dre_group_2 varchar(120),
  include_in_fcd boolean NOT NULL DEFAULT true,
  include_in_fcm boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS chart_accounts_tenant_code_uidx ON chart_accounts (tenant_id, code);
CREATE INDEX IF NOT EXISTS chart_accounts_tenant_idx ON chart_accounts (tenant_id);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name varchar(120) NOT NULL,
  institution varchar(120),
  account_type bank_account_type NOT NULL DEFAULT 'checking',
  bank_code varchar(32),
  opening_balance_cents integer NOT NULL DEFAULT 0,
  opening_balance_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS bank_accounts_tenant_idx ON bank_accounts (tenant_id);

CREATE TABLE IF NOT EXISTS treasury_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  code varchar(40),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_pm_tenant_name_uidx ON treasury_payment_methods (tenant_id, name);
CREATE INDEX IF NOT EXISTS treasury_pm_tenant_idx ON treasury_payment_methods (tenant_id);

CREATE TABLE IF NOT EXISTS credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name varchar(120) NOT NULL,
  institution varchar(120),
  limit_cents integer NOT NULL DEFAULT 0,
  closing_day integer NOT NULL DEFAULT 1,
  due_day integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS credit_cards_tenant_idx ON credit_cards (tenant_id);

CREATE TABLE IF NOT EXISTS card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_invoices_card_idx ON card_invoices (credit_card_id);
CREATE INDEX IF NOT EXISTS card_invoices_tenant_idx ON card_invoices (tenant_id);

CREATE TABLE IF NOT EXISTS finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  direction finance_direction NOT NULL,
  description varchar(300) NOT NULL,
  party_name varchar(200),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  chart_account_id uuid REFERENCES chart_accounts(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  treasury_payment_method_id uuid REFERENCES treasury_payment_methods(id) ON DELETE SET NULL,
  credit_card_id uuid REFERENCES credit_cards(id) ON DELETE SET NULL,
  card_invoice_id uuid REFERENCES card_invoices(id) ON DELETE SET NULL,
  cost_center varchar(120),
  doc_type varchar(60),
  doc_number varchar(80),
  issue_date date,
  due_date date,
  settled_at timestamptz,
  forecast_cents integer,
  budget_cents integer,
  actual_cents integer,
  installment_index integer,
  installment_total integer,
  recurrence finance_recurrence NOT NULL DEFAULT 'none',
  parent_entry_id uuid,
  is_forecast_only boolean NOT NULL DEFAULT false,
  reconciled_at timestamptz,
  notes text,
  external_source varchar(40),
  external_id varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS finance_entries_tenant_due_idx ON finance_entries (tenant_id, due_date);
CREATE INDEX IF NOT EXISTS finance_entries_tenant_issue_idx ON finance_entries (tenant_id, issue_date);
CREATE INDEX IF NOT EXISTS finance_entries_tenant_settle_idx ON finance_entries (tenant_id, settled_at);
CREATE INDEX IF NOT EXISTS finance_entries_bank_idx ON finance_entries (bank_account_id);
CREATE INDEX IF NOT EXISTS finance_entries_chart_idx ON finance_entries (chart_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS finance_entries_external_uidx
  ON finance_entries (tenant_id, external_source, external_id);

CREATE TABLE IF NOT EXISTS finance_entry_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  finance_entry_id uuid NOT NULL REFERENCES finance_entries(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_entry_links_payment_uidx ON finance_entry_links (payment_id);
CREATE INDEX IF NOT EXISTS finance_entry_links_entry_idx ON finance_entry_links (finance_entry_id);

CREATE TABLE IF NOT EXISTS treasury_bridge_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  method_codes text NOT NULL DEFAULT '["pix","cash","debit","credit","transfer"]',
  default_chart_account_code varchar(32) DEFAULT '121',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_bridge_settings_tenant_uidx ON treasury_bridge_settings (tenant_id);
`);
  console.log("[bootstrap] schema tesouraria (chart/bank/entries/cards/bridge) ok");
}

await withTimeout(ensureRequiredAccountSchema(), BOOTSTRAP_TIMEOUT_MS);

const server = resolveServer();
if (!server) {
  console.error("[start] server.js não encontrado (tente npm run build antes).");
  process.exit(1);
}

const child = spawn(process.execPath, [server.file], {
  stdio: "inherit",
  env: process.env,
  cwd: server.cwd,
});

child.on("error", (err) => {
  console.error("[start] falha ao subir Next.js:", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}

setImmediate(async () => {
  withTimeout(runBootstrap(), BOOTSTRAP_TIMEOUT_MS).catch((err) => {
    console.error("[bootstrap]", err.message ?? err);
  });
  withTimeout(runBirthdateBackfill(), 90_000).catch((err) => {
    console.error("[bootstrap:birthdates]", err.message ?? err);
  });
  withTimeout(runContaClienteImport(), 60_000).catch((err) => {
    console.error("[bootstrap:conta-cliente]", err.message ?? err);
  });
  await runDonnaEnsureStandalone();
  await runDonnaImportStandalone();
});

/** Idempotente: preenche clients.birth_date a partir de data/appbarber-birthdates.json */
async function runBirthdateBackfill() {
  if (process.env.SKIP_DEPLOY_BOOTSTRAP === "1") return;
  if (!process.env.DATABASE_URL) return;
  const file = path.join(ROOT, "data/appbarber-birthdates.json");
  if (!fs.existsSync(file)) {
    console.log("[bootstrap:birthdates] data/appbarber-birthdates.json ausente — pulado.");
    return;
  }
  try {
    await spawnScript("backfill-birthdates.mjs");
  } catch (err) {
    console.error("[bootstrap:birthdates]", err);
  }
}

/** Idempotente: importa saldos Conta Cliente (fiado) do AppBarber. */
async function runContaClienteImport() {
  if (process.env.SKIP_DEPLOY_BOOTSTRAP === "1") return;
  if (!process.env.DATABASE_URL) return;
  const file = path.join(ROOT, "data/appbarber-conta-cliente.json");
  if (!fs.existsSync(file)) {
    console.log("[bootstrap:conta-cliente] data/appbarber-conta-cliente.json ausente — pulado.");
    return;
  }
  try {
    await spawnScript("import-conta-cliente-saldos.mjs", ["--file", file]);
  } catch (err) {
    console.error("[bootstrap:conta-cliente]", err);
  }
}

async function runDonnaEnsureStandalone() {
  if (process.env.SKIP_DEPLOY_BOOTSTRAP === "1") return;
  if (!process.env.DATABASE_URL) return;
  try {
    await spawnScript("ensure-donna-access.mjs");
  } catch (err) {
    console.error("[bootstrap:donna:access]", err);
  }
}

async function runDonnaImportStandalone() {
  if (process.env.SKIP_DEPLOY_BOOTSTRAP === "1") return;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;
  let postgres;
  try {
    postgres = (await import("postgres")).default;
  } catch {
    return;
  }
  const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
  try {
    await runDonnaBootstrap(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
