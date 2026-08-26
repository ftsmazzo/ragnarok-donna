/**
 * Startup de produção: vincula clientes no Postgres e sobe o Next.js.
 * Roda automaticamente no deploy (Docker CMD) — sem terminal no EasyPanel.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TENANT_SLUG = "ragnaroks";
const LOCK_KEY = 8347291;
const JSON_BOOTSTRAP_VERSION = 1;

function exportDir() {
  const dir =
    process.env.APPBARBER_EXPORT_DIR ?? path.join(ROOT, "data/appbarber-export");
  if (!fs.existsSync(path.join(dir, "agenda.json"))) return null;
  return dir;
}

function readJson(name, dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
}

async function runBootstrap() {
  if (process.env.SKIP_DEPLOY_BOOTSTRAP === "1") return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[bootstrap] DATABASE_URL ausente — pulando.");
    return;
  }

  const sql = postgres(dbUrl, { max: 1 });

  try {
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
    console.log("[bootstrap] vinculando clientes ↔ agenda ↔ comandas…");

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
    console.log("[bootstrap] concluído.", { linked, ...stats });
  } catch (err) {
    console.error("[bootstrap] falhou (app sobe mesmo assim):", err);
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

await runBootstrap();

const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
  stdio: "inherit",
  env: process.env,
});

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.kill(sig));
}
