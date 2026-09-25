/**
 * One-shot no deploy (start-production): limpa pagamentos duplicados de venda de
 * pacote da Flávia Arnold — sem painel, sem terminal EasyPanel.
 *
 * Idempotente: se não houver excesso/órfãos, só loga e sai.
 *
 * Escopo: clientes cujo nome bate Flávia/Flavia Arnold; janela últimos 14 dias (SP).
 */
import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

const LOCK_KEY = 8347294;
const LOOKBACK_DAYS = 14;
const NAME_PATTERNS = ["%flavia%arnold%", "%flávia%arnold%"];

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
  console.warn("[fix:flavia-pkg] DATABASE_URL ausente — pulado.");
  process.exit(0);
}

const sql = postgres(dbUrl, { max: 1, connect_timeout: 20, onnotice: () => {} });

async function main() {
  const [{ ok: locked }] = await sql`select pg_try_advisory_lock(${LOCK_KEY}) as ok`;
  if (!locked) {
    console.log("[fix:flavia-pkg] outro processo em execução — pulado.");
    return;
  }

  try {
    const clients = await sql`
      select c.id, c.name, c.tenant_id, t.slug
      from clients c
      join tenants t on t.id = c.tenant_id
      where c.deleted_at is null
        and (
          c.name ilike ${NAME_PATTERNS[0]}
          or c.name ilike ${NAME_PATTERNS[1]}
        )
    `;
    if (!clients.length) {
      console.log("[fix:flavia-pkg] nenhum cliente Flávia Arnold — nada a fazer.");
      return;
    }

    let totalRefunded = 0;
    let orphanCancelled = 0;

    for (const client of clients) {
      console.log(
        `[fix:flavia-pkg] cliente ${client.name} (${client.slug}) id=${client.id}`
      );

      const orders = await sql`
        select o.id, o.discount_cents, o.status
        from orders o
        where o.tenant_id = ${client.tenant_id}
          and o.client_id = ${client.id}
          and o.deleted_at is null
          and o.opened_at >= (now() at time zone 'America/Sao_Paulo')::date
            - (${LOOKBACK_DAYS}::int || ' days')::interval
      `;

      for (const order of orders) {
        const [pkgSum] = await sql`
          select
            coalesce(sum(oi.total_cents), 0)::int as total,
            count(*)::int as n
          from order_items oi
          where oi.order_id = ${order.id}
            and oi.tenant_id = ${client.tenant_id}
            and oi.item_type = 'package'
        `;
        if (!pkgSum?.n) continue;

        const due = Math.max(0, Number(pkgSum.total) - Math.min(order.discount_cents, Number(pkgSum.total)));
        const pays = await sql`
          select id, method, amount_cents
          from payments
          where order_id = ${order.id}
            and tenant_id = ${client.tenant_id}
          order by paid_at desc
        `;
        let excess = pays.reduce((s, p) => s + p.amount_cents, 0) - due;
        if (excess <= 0) continue;

        console.log(
          `[fix:flavia-pkg] comanda ${order.id}: due=${due} paid=${pays.reduce((s, p) => s + p.amount_cents, 0)} excess=${excess}`
        );

        for (const pay of pays) {
          if (excess <= 0) break;
          const take = Math.min(pay.amount_cents, excess);

          // Remove movimento de entrada correspondente (caixa do dia).
          if (take === pay.amount_cents) {
            await sql`
              delete from cash_movements
              where id in (
                select id from cash_movements
                where tenant_id = ${client.tenant_id}
                  and order_id = ${order.id}
                  and direction = 'in'
                  and method = ${pay.method}
                  and amount_cents = ${pay.amount_cents}
                order by created_at desc
                limit 1
              )
            `;
            await sql`
              delete from payments
              where id = ${pay.id} and tenant_id = ${client.tenant_id}
            `;
          } else {
            await sql`
              update payments
              set amount_cents = ${pay.amount_cents - take}, updated_at = now()
              where id = ${pay.id} and tenant_id = ${client.tenant_id}
            `;
          }

          totalRefunded += take;
          excess -= take;
        }
      }

      // Órfãos: pagamento de pacote sem carteira ativa na comanda → remove pagamento + item.
      const orphans = await sql`
        select distinct o.id as order_id, p.id as payment_id, oi.id as item_id
        from payments p
        join orders o on o.id = p.order_id
        join order_items oi
          on oi.order_id = o.id and oi.item_type = 'package'
        left join client_packages cp
          on cp.order_id = o.id and cp.status <> 'cancelled'
        where o.tenant_id = ${client.tenant_id}
          and o.client_id = ${client.id}
          and o.deleted_at is null
          and cp.id is null
          and p.paid_at >= (now() at time zone 'America/Sao_Paulo')::date
            - (${LOOKBACK_DAYS}::int || ' days')::interval
      `;

      const seenOrders = new Set();
      for (const row of orphans) {
        if (seenOrders.has(row.order_id)) continue;
        seenOrders.add(row.order_id);

        const pays = await sql`
          select id, method, amount_cents from payments
          where order_id = ${row.order_id} and tenant_id = ${client.tenant_id}
        `;
        for (const pay of pays) {
          await sql`
            delete from cash_movements
            where tenant_id = ${client.tenant_id}
              and order_id = ${row.order_id}
              and direction = 'in'
              and method = ${pay.method}
              and amount_cents = ${pay.amount_cents}
          `;
          await sql`
            delete from payments
            where id = ${pay.id} and tenant_id = ${client.tenant_id}
          `;
          totalRefunded += pay.amount_cents;
        }

        await sql`
          delete from order_items
          where order_id = ${row.order_id}
            and tenant_id = ${client.tenant_id}
            and item_type = 'package'
        `;

        const [agg] = await sql`
          select coalesce(sum(total_cents), 0)::int as total
          from order_items
          where order_id = ${row.order_id} and tenant_id = ${client.tenant_id}
        `;
        await sql`
          update orders
          set total_cents = ${agg?.total ?? 0}, updated_at = now()
          where id = ${row.order_id} and tenant_id = ${client.tenant_id}
        `;
        orphanCancelled += 1;
        console.log(`[fix:flavia-pkg] órfão cancelado comanda=${row.order_id}`);
      }
    }

    if (totalRefunded <= 0 && orphanCancelled <= 0) {
      console.log("[fix:flavia-pkg] já limpo — nada a estornar.");
    } else {
      console.log(
        `[fix:flavia-pkg] ok — refundedCents=${totalRefunded} orphanOrders=${orphanCancelled}`
      );
    }
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
  }
}

try {
  await main();
} catch (err) {
  console.error("[fix:flavia-pkg] falhou (não bloqueia start):", err?.message ?? err);
  process.exitCode = 0;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
