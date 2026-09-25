/**
 * One-shot: remove do caixa físico movimentos de comandas "Consumo de profissional"
 * (distorciam o saldo esperado e o fechamento). Idempotente.
 */
import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

const LOCK_KEY = 8347295;

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (existsSync(".env")) {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

const dbUrl = loadDatabaseUrl();
if (!dbUrl) {
  console.warn("[fix:staff-cash] DATABASE_URL ausente — pulado.");
  process.exit(0);
}

const sql = postgres(dbUrl, { max: 1, connect_timeout: 20, onnotice: () => {} });

try {
  const [{ ok: locked }] = await sql`select pg_try_advisory_lock(${LOCK_KEY}) as ok`;
  if (!locked) {
    console.log("[fix:staff-cash] outro processo — pulado.");
  } else {
    try {
      const deleted = await sql`
        delete from cash_movements cm
        using orders o
        where cm.order_id = o.id
          and cm.direction = 'in'
          and coalesce(o.meta->>'kind', '') = 'staff_consumption'
        returning cm.id
      `;
      console.log(
        `[fix:staff-cash] removidos ${deleted.length} movimento(s) de consumo profissional do caixa`
      );
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    }
  }
} catch (err) {
  console.error("[fix:staff-cash] falhou (não bloqueia start):", err?.message ?? err);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
