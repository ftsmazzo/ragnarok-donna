/**
 * Startup de produção: sobe o Next.js imediatamente e vincula clientes em background.
 * Roda no deploy (npm start / Docker) — sem terminal no EasyPanel.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TENANT_SLUG = "ragnaroks";
const LOCK_KEY = 8347291;
const JSON_BOOTSTRAP_VERSION = 1;
const BOOTSTRAP_TIMEOUT_MS = 120_000;

function exportDir() {
  const dir =
    process.env.APPBARBER_EXPORT_DIR ?? path.join(ROOT, "data/appbarber-export");
  if (!fs.existsSync(path.join(dir, "agenda.json"))) return null;
  return dir;
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

  const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });

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
`);
    console.log("[bootstrap] schema staff_advances + outreach_jobs + agent_profiles.persona ok");

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

setImmediate(() => {
  withTimeout(runBootstrap(), BOOTSTRAP_TIMEOUT_MS).catch((err) => {
    console.error("[bootstrap]", err.message ?? err);
  });
});
