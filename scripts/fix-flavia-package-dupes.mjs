/**
 * Limpeza cirúrgica — Flávia Arnold / venda de pacote duplicada (#231).
 *
 * Roda no boot do deploy (start-production). Idempotente.
 *
 * O QUE FAZ (só isso):
 * 1) Em comandas dela com MAIS DE UM item `package`: mantém 1 (ligado à carteira
 *    ativa ou o mais antigo) e APAGA os itens extras (inserções do retry).
 * 2) Se a soma dos pagamentos > valor devido da comanda (após o passo 1):
 *    APAGA pagamentos excedentes (do mais novo ao mais antigo) e o cash_movement
 *    `in` correspondente 1:1 — deixa exatamente o valor devido.
 *
 * O QUE NÃO FAZ:
 * - Não toca client_packages / créditos / carteira
 * - Não apaga a venda válida (1 item + pagamentos que cobrem o devido)
 * - Não mexe em serviços/produtos da comanda
 * - Não altera outros clientes
 * - Não faz UPDATE parcial de valor de pagamento (só DELETE de linha inteira)
 * - Não cancela “órfãos” agressivos
 *
 * DRY_RUN: FLAVIA_PKG_FIX_DRY_RUN=1 → só loga, não apaga.
 */
import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

const LOCK_KEY = 8347294;
const LOOKBACK_DAYS = 14;
const NAME_PATTERNS = ["%flavia%arnold%", "%flávia%arnold%"];
const DRY_RUN = process.env.FLAVIA_PKG_FIX_DRY_RUN === "1";

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
    console.log(
      `[fix:flavia-pkg] início mode=${DRY_RUN ? "DRY_RUN" : "APPLY"} lookback=${LOOKBACK_DAYS}d`
    );

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

    let deletedItems = 0;
    let deletedPays = 0;
    let deletedMoves = 0;
    let refundedCents = 0;

    for (const client of clients) {
      console.log(
        `[fix:flavia-pkg] escopo cliente="${client.name}" tenant=${client.slug} id=${client.id}`
      );

      const orders = await sql`
        select o.id, o.discount_cents, o.status, o.external_id
        from orders o
        where o.tenant_id = ${client.tenant_id}
          and o.client_id = ${client.id}
          and o.deleted_at is null
          and o.opened_at >= (now() at time zone 'America/Sao_Paulo')::date
            - (${LOOKBACK_DAYS}::int || ' days')::interval
          and exists (
            select 1 from order_items oi
            where oi.order_id = o.id
              and oi.tenant_id = ${client.tenant_id}
              and oi.item_type = 'package'
          )
      `;

      for (const order of orders) {
        const items = await sql`
          select oi.id, oi.total_cents, oi.created_at, oi.meta, oi.package_id
          from order_items oi
          where oi.order_id = ${order.id}
            and oi.tenant_id = ${client.tenant_id}
            and oi.item_type = 'package'
          order by oi.created_at asc
        `;
        if (items.length === 0) continue;

        // Keeper: item ligado à carteira ativa; senão o mais antigo com meta.packageSale; senão o mais antigo.
        const linked = await sql`
          select cp.order_item_id
          from client_packages cp
          where cp.client_id = ${client.id}
            and cp.tenant_id = ${client.tenant_id}
            and cp.order_id = ${order.id}
            and cp.status <> 'cancelled'
            and cp.order_item_id is not null
          limit 1
        `;
        const linkedId = linked[0]?.order_item_id ?? null;
        let keeper =
          (linkedId && items.find((i) => i.id === linkedId)) ||
          items.find((i) => {
            const meta = i.meta && typeof i.meta === "object" ? i.meta : {};
            return Boolean(meta.packageSale);
          }) ||
          items[0];

        const extras = items.filter((i) => i.id !== keeper.id);
        if (extras.length > 0) {
          console.log(
            `[fix:flavia-pkg] comanda ${order.id}: keep item=${keeper.id} (${keeper.total_cents}¢); apagar ${extras.length} item(ns) duplicado(s)`
          );
          for (const extra of extras) {
            console.log(
              `  - DELETE order_items id=${extra.id} total=${extra.total_cents} created=${extra.created_at?.toISOString?.() ?? extra.created_at}`
            );
            if (!DRY_RUN) {
              await sql`
                delete from order_items
                where id = ${extra.id}
                  and tenant_id = ${client.tenant_id}
                  and order_id = ${order.id}
                  and item_type = 'package'
              `;
            }
            deletedItems += 1;
          }

          if (!DRY_RUN) {
            const [agg] = await sql`
              select coalesce(sum(total_cents), 0)::int as total
              from order_items
              where order_id = ${order.id} and tenant_id = ${client.tenant_id}
            `;
            const nextTotal = Number(agg?.total ?? 0);
            const nextDiscount = Math.min(order.discount_cents, nextTotal);
            await sql`
              update orders
              set
                total_cents = ${nextTotal},
                discount_cents = ${nextDiscount},
                updated_at = now()
              where id = ${order.id} and tenant_id = ${client.tenant_id}
            `;
          }
        }

        // Due = itens restantes − desconto (reconsulta após deletes).
        const [pkgSum] = await sql`
          select coalesce(sum(oi.total_cents), 0)::int as total
          from order_items oi
          where oi.order_id = ${order.id}
            and oi.tenant_id = ${client.tenant_id}
            and oi.item_type = 'package'
        `;
        const [allSum] = await sql`
          select coalesce(sum(oi.total_cents), 0)::int as total
          from order_items oi
          where oi.order_id = ${order.id}
            and oi.tenant_id = ${client.tenant_id}
        `;
        // Em dry-run os extras ainda estão: due teórico = keeper + não-pacote.
        const due = DRY_RUN
          ? Math.max(
              0,
              keeper.total_cents +
                (Number(allSum?.total ?? 0) - items.reduce((s, i) => s + i.total_cents, 0)) -
                Math.min(
                  order.discount_cents,
                  keeper.total_cents +
                    (Number(allSum?.total ?? 0) - items.reduce((s, i) => s + i.total_cents, 0))
                )
            )
          : Math.max(
              0,
              Number(allSum?.total ?? 0) -
                Math.min(order.discount_cents, Number(allSum?.total ?? 0))
            );

        const pays = await sql`
          select id, method, amount_cents, paid_at
          from payments
          where order_id = ${order.id}
            and tenant_id = ${client.tenant_id}
          order by paid_at asc
        `;
        const paid = pays.reduce((s, p) => s + p.amount_cents, 0);
        let excess = paid - due;
        if (excess <= 0) {
          if (extras.length === 0) {
            console.log(
              `[fix:flavia-pkg] comanda ${order.id}: ok (itens=${items.length} paid=${paid} due≈${due})`
            );
          }
          continue;
        }

        // Mantém pagamentos do mais antigo; remove do mais novo enquanto excess > 0.
        // Só DELETE de linha inteira — se o excesso for parcial num pagamento, para e loga.
        const newestFirst = [...pays].reverse();
        console.log(
          `[fix:flavia-pkg] comanda ${order.id}: paid=${paid} due=${due} excess=${excess} — remover pagamentos novos`
        );

        for (const pay of newestFirst) {
          if (excess <= 0) break;
          if (pay.amount_cents > excess) {
            console.warn(
              `  ! SKIP pagamento parcial id=${pay.id} amount=${pay.amount_cents} excessRestante=${excess} — revisão manual`
            );
            break;
          }

          console.log(
            `  - DELETE payment id=${pay.id} method=${pay.method} amount=${pay.amount_cents} paid_at=${pay.paid_at?.toISOString?.() ?? pay.paid_at}`
          );

          if (!DRY_RUN) {
            const moved = await sql`
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
              returning id
            `;
            deletedMoves += moved.length;

            await sql`
              delete from payments
              where id = ${pay.id}
                and tenant_id = ${client.tenant_id}
                and order_id = ${order.id}
            `;
          }

          deletedPays += 1;
          refundedCents += pay.amount_cents;
          excess -= pay.amount_cents;
        }
      }
    }

    console.log(
      `[fix:flavia-pkg] fim mode=${DRY_RUN ? "DRY_RUN" : "APPLY"} ` +
        `deletedItems=${deletedItems} deletedPays=${deletedPays} ` +
        `deletedMoves=${deletedMoves} refundedCents=${refundedCents}`
    );
    if (DRY_RUN && (deletedItems > 0 || deletedPays > 0)) {
      console.log(
        "[fix:flavia-pkg] DRY_RUN — nada gravado. Remova FLAVIA_PKG_FIX_DRY_RUN para aplicar."
      );
    }
    if (!DRY_RUN && deletedItems === 0 && deletedPays === 0) {
      console.log("[fix:flavia-pkg] já limpo — nenhuma inserção errada encontrada.");
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
