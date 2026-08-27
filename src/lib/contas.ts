import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { schema } from "@/db";
import { monthStartSp, rangeBoundsSp, todaySp } from "./datetime";
import { getDb } from "./db";
import { getDefaultTenant } from "./tenant";

/** Contas a pagar/receber derivadas de vales abertos + cartão crédito no período. */
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
  const receivableCents = Number(creditAgg?.total ?? 0);
  const outCents = cashOut.reduce((s, r) => s + r.amountCents, 0);

  return {
    from,
    to,
    payableCents,
    receivableCents,
    outCents,
    openAdvances,
    creditCount: Number(creditAgg?.n ?? 0),
    cashOut,
  };
}
