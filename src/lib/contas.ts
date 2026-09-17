import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { schema } from "@/db";
import { monthStartSp, rangeBoundsSp, todaySp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";

/** Contas operacionais: vales a pagar + cartão crédito no período (informativo) + saídas. */
export async function reportContas(opts?: { from?: string; to?: string }) {
  const tenant = await getDefaultTenant();
  const db = getDb();
  const from = opts?.from ?? monthStartSp();
  const to = opts?.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);

  const openAdvances = await db
    .select({
      id: schema.staffAdvances.id,
      staffName: schema.staff.name,
      kind: schema.staffAdvances.kind,
      amountCents: schema.staffAdvances.amountCents,
      occurredAt: schema.staffAdvances.occurredAt,
      notes: schema.staffAdvances.notes,
    })
    .from(schema.staffAdvances)
    .leftJoin(schema.staff, eq(schema.staffAdvances.staffId, schema.staff.id))
    .where(
      and(
        eq(schema.staffAdvances.tenantId, tenant.id),
        eq(schema.staffAdvances.status, "open"),
        ne(schema.staffAdvances.kind, "payout"),
        isNull(schema.staffAdvances.settledAt)
      )
    )
    .orderBy(asc(schema.staffAdvances.occurredAt))
    .limit(100);

  /** Cartão de crédito no PDV — já recebido na maquininha; NÃO é fiado/a receber. */
  const [creditAgg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, tenant.id),
        eq(schema.payments.method, "credit"),
        gte(schema.payments.paidAt, start),
        lte(schema.payments.paidAt, end)
      )
    );

  /** Fiado real: saldo negativo na Conta do Cliente. */
  const [clientDebtAgg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(abs(${schema.clients.accountBalanceCents})), 0)::int`,
    })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        isNull(schema.clients.deletedAt),
        sql`${schema.clients.accountBalanceCents} < 0`
      )
    );

  /** Clientes com débito (a receber) — lista operacional. */
  const debtors = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      balanceCents: schema.clients.accountBalanceCents,
    })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        isNull(schema.clients.deletedAt),
        sql`${schema.clients.accountBalanceCents} < 0`
      )
    )
    .orderBy(asc(schema.clients.accountBalanceCents))
    .limit(200);

  /** Clientes com crédito (saldo positivo) — informativo. */
  const [clientCreditAgg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.clients.accountBalanceCents}), 0)::int`,
    })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        isNull(schema.clients.deletedAt),
        sql`${schema.clients.accountBalanceCents} > 0`
      )
    );

  const creditors = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      balanceCents: schema.clients.accountBalanceCents,
    })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        isNull(schema.clients.deletedAt),
        sql`${schema.clients.accountBalanceCents} > 0`
      )
    )
    .orderBy(desc(schema.clients.accountBalanceCents))
    .limit(200);

  /**
   * Comandas abertas com valor > 0 — operacional (ticket em andamento),
   * NÃO entram em "a receber". Pacote/cortesia (total 0) ficam de fora.
   * No AppBarber, "Total a Receber" do fluxo ≠ cartão e ≠ comanda aberta;
   * dívida real = Conta Cliente (fiado).
   */
  const [openOrdersAgg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt),
        sql`${schema.orders.totalCents} > 0`
      )
    );

  const cashOut = await db
    .select({
      id: schema.cashMovements.id,
      createdAt: schema.cashMovements.createdAt,
      amountCents: schema.cashMovements.amountCents,
      description: schema.cashMovements.description,
      method: schema.cashMovements.method,
    })
    .from(schema.cashMovements)
    .where(
      and(
        eq(schema.cashMovements.tenantId, tenant.id),
        eq(schema.cashMovements.direction, "out"),
        gte(schema.cashMovements.createdAt, start),
        lte(schema.cashMovements.createdAt, end)
      )
    )
    .orderBy(desc(schema.cashMovements.createdAt))
    .limit(80);

  const payableCents = openAdvances.reduce((s, r) => s + r.amountCents, 0);
  const cardCreditCents = Number(creditAgg?.total ?? 0);
  const clientDebtCents = Number(clientDebtAgg?.total ?? 0);
  const clientCreditCents = Number(clientCreditAgg?.total ?? 0);
  const openOrdersCents = Number(openOrdersAgg?.total ?? 0);
  /** A receber = só fiado (Conta Cliente). Comanda aberta ≠ a receber. */
  const receivableCents = clientDebtCents;
  const outCents = cashOut.reduce((s, r) => s + r.amountCents, 0);

  return {
    from,
    to,
    payableCents,
    receivableCents,
    clientDebtCents,
    clientCreditCents,
    openOrdersCents,
    openOrdersCount: Number(openOrdersAgg?.n ?? 0),
    clientDebtCount: Number(clientDebtAgg?.n ?? 0),
    clientCreditCount: Number(clientCreditAgg?.n ?? 0),
    cardCreditCents,
    cardCreditCount: Number(creditAgg?.n ?? 0),
    outCents,
    openAdvances,
    debtors,
    creditors,
    creditCount: Number(creditAgg?.n ?? 0),
    cashOut,
  };
}
