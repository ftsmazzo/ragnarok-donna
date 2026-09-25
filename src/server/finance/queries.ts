import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, shiftDateSp, todaySp } from "@/lib/datetime";
import { labelStoredPayment, paymentLabelFromParts } from "@/lib/payment-codes";
import { paymentFeeCents } from "@/lib/payment-fees";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import type { CashDaySnapshot, CashMovementRow, CashPermissions, CashSessionSummary } from "./types";

export async function getCashPermissions(): Promise<CashPermissions> {
  const session = await requireSession();
  return { canWrite: hasCapability(session.role, "cash.write") };
}

async function loadUserNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const db = createDb();
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, unique));
  for (const u of users) names.set(u.id, u.name);
  return names;
}

function toSession(
  row: {
    id: string;
    openedAt: Date;
    closedAt: Date | null;
    openingCents: number;
    closingCents: number | null;
    notes: string | null;
    openedByUserId: string | null;
    closedByUserId: string | null;
  },
  names: Map<string, string>
): CashSessionSummary {
  return {
    id: row.id,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openingCents: row.openingCents,
    closingCents: row.closingCents,
    notes: row.notes,
    openedByName: row.openedByUserId ? names.get(row.openedByUserId) ?? null : null,
    closedByName: row.closedByUserId ? names.get(row.closedByUserId) ?? null : null,
    isOpen: !row.closedAt,
  };
}

export async function findOpenCashSessionId(tenantId: string): Promise<string | null> {
  const db = createDb();
  const [row] = await db
    .select({ id: schema.cashSessions.id })
    .from(schema.cashSessions)
    .where(and(eq(schema.cashSessions.tenantId, tenantId), isNull(schema.cashSessions.closedAt)))
    .orderBy(desc(schema.cashSessions.openedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function getOpenCashSession(): Promise<CashSessionSummary | null> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [row] = await db
    .select({
      id: schema.cashSessions.id,
      openedAt: schema.cashSessions.openedAt,
      closedAt: schema.cashSessions.closedAt,
      openingCents: schema.cashSessions.openingCents,
      closingCents: schema.cashSessions.closingCents,
      notes: schema.cashSessions.notes,
      openedByUserId: schema.cashSessions.openedByUserId,
      closedByUserId: schema.cashSessions.closedByUserId,
    })
    .from(schema.cashSessions)
    .where(
      and(eq(schema.cashSessions.tenantId, tenant.id), isNull(schema.cashSessions.closedAt))
    )
    .orderBy(desc(schema.cashSessions.openedAt))
    .limit(1);

  if (!row) return null;
  const names = await loadUserNames([row.openedByUserId, row.closedByUserId]);
  return toSession(row, names);
}

export async function getCashDay(dateStr?: string): Promise<CashDaySnapshot> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const date = dateStr ?? todaySp();
  const { start, end } = dayBoundsSp(date);

  // Urgente: movimentos antigos de "Consumo de profissional" distorcem o saldo
  // e travam o fechamento. Remover do caixa físico (idempotente).
  await db.execute(sql`
    delete from cash_movements cm
    using orders o
    where cm.order_id = o.id
      and cm.tenant_id = ${tenant.id}
      and o.tenant_id = ${tenant.id}
      and cm.direction = 'in'
      and coalesce(o.meta->>'kind', '') = 'staff_consumption'
  `);

  const openSession = await getOpenCashSession();

  const [daySessionRow] = await db
    .select({
      id: schema.cashSessions.id,
      openedAt: schema.cashSessions.openedAt,
      closedAt: schema.cashSessions.closedAt,
      openingCents: schema.cashSessions.openingCents,
      closingCents: schema.cashSessions.closingCents,
      notes: schema.cashSessions.notes,
      openedByUserId: schema.cashSessions.openedByUserId,
      closedByUserId: schema.cashSessions.closedByUserId,
    })
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, tenant.id),
        gte(schema.cashSessions.openedAt, start),
        lte(schema.cashSessions.openedAt, end)
      )
    )
    .orderBy(desc(schema.cashSessions.openedAt))
    .limit(1);

  let session: CashSessionSummary | null = null;
  if (daySessionRow) {
    const names = await loadUserNames([
      daySessionRow.openedByUserId,
      daySessionRow.closedByUserId,
    ]);
    session = toSession(daySessionRow, names);
  } else if (openSession && date === todaySp()) {
    session = openSession;
  }

  const sessionForMovements = session ?? (date === todaySp() ? openSession : null);

  let movements: CashMovementRow[] = [];
  if (sessionForMovements) {
    const rows = await db
      .select({
        id: schema.cashMovements.id,
        createdAt: schema.cashMovements.createdAt,
        direction: schema.cashMovements.direction,
        method: schema.cashMovements.method,
        amountCents: schema.cashMovements.amountCents,
        description: schema.cashMovements.description,
        orderId: schema.cashMovements.orderId,
        orderExternalId: schema.orders.externalId,
        clientName: schema.clients.name,
        orderMeta: schema.orders.meta,
      })
      .from(schema.cashMovements)
      .leftJoin(schema.orders, eq(schema.cashMovements.orderId, schema.orders.id))
      .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
      .where(
        and(
          eq(schema.cashMovements.tenantId, tenant.id),
          eq(schema.cashMovements.cashSessionId, sessionForMovements.id)
        )
      )
      .orderBy(desc(schema.cashMovements.createdAt));

    movements = rows.map((r) => {
      const meta = r.orderMeta as Record<string, unknown> | null;
      const isStaffConsumption = meta?.kind === "staff_consumption";
      const baseDesc = r.description;
      const description =
        isStaffConsumption && baseDesc
          ? `${baseDesc} · Consumo profissional`
          : isStaffConsumption
            ? "Consumo profissional"
            : baseDesc;
      return {
        id: r.id,
        createdAt: r.createdAt,
        direction: (r.direction === "out" ? "out" : "in") as "in" | "out",
        method: r.method,
        amountCents: r.amountCents,
        description,
        orderId: r.orderId,
        orderExternalId: r.orderExternalId,
        clientName: r.clientName ?? (typeof meta?.consumerStaffName === "string" ? meta.consumerStaffName : null),
      };
    });
  }

  const expectedInCents =
    (sessionForMovements?.openingCents ?? 0) +
    movements.filter((m) => m.direction === "in").reduce((s, m) => s + m.amountCents, 0);
  const expectedOutCents = movements
    .filter((m) => m.direction === "out")
    .reduce((s, m) => s + m.amountCents, 0);

  const brandSql = sql<string | null>`${schema.payments.meta}->>'brand'`;
  const installmentsSql = sql<string | null>`${schema.payments.meta}->>'installments'`;
  const kindSql = sql<string | null>`${schema.payments.meta}->>'kind'`;
  const byMethod = await db
    .select({
      method: schema.payments.method,
      brand: brandSql,
      installments: installmentsSql,
      kind: kindSql,
      n: count(),
      totalCents: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
    })
    .from(schema.payments)
    .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.payments.tenantId, tenant.id),
        gte(schema.payments.paidAt, start),
        lte(schema.payments.paidAt, end),
        // Consumo profissional→profissional não entra no caixa / totais do dia.
        sql`coalesce(${schema.orders.meta}->>'kind','') <> 'staff_consumption'`
      )
    )
    .groupBy(schema.payments.method, brandSql, installmentsSql, kindSql)
    .orderBy(desc(sql`sum(${schema.payments.amountCents})`));

  const payments = await db
    .select({
      id: schema.payments.id,
      paidAt: schema.payments.paidAt,
      method: schema.payments.method,
      meta: schema.payments.meta,
      amountCents: schema.payments.amountCents,
      orderId: schema.payments.orderId,
      clientName: schema.clients.name,
      orderExternalId: schema.orders.externalId,
    })
    .from(schema.payments)
    .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(
      and(
        eq(schema.payments.tenantId, tenant.id),
        gte(schema.payments.paidAt, start),
        lte(schema.payments.paidAt, end),
        sql`coalesce(${schema.orders.meta}->>'kind','') <> 'staff_consumption'`
      )
    )
    .orderBy(desc(schema.payments.paidAt));

  const orderIds = [...new Set(payments.map((p) => p.orderId))];
  const cancelByOrder = new Map<string, string>();
  if (orderIds.length) {
    const pkgs = await db
      .select({
        id: schema.clientPackages.id,
        orderId: schema.clientPackages.orderId,
      })
      .from(schema.clientPackages)
      .where(
        and(
          eq(schema.clientPackages.tenantId, tenant.id),
          inArray(schema.clientPackages.orderId, orderIds),
          sql`${schema.clientPackages.status} <> 'cancelled'`
        )
      );
    const pkgIds = pkgs.map((p) => p.id);
    if (pkgIds.length) {
      const creditRows = await db
        .select({
          clientPackageId: schema.clientPackageCredits.clientPackageId,
          remainingQty: schema.clientPackageCredits.remainingQty,
          totalQty: schema.clientPackageCredits.totalQty,
        })
        .from(schema.clientPackageCredits)
        .where(
          and(
            eq(schema.clientPackageCredits.tenantId, tenant.id),
            inArray(schema.clientPackageCredits.clientPackageId, pkgIds)
          )
        );
      const unused = new Set<string>();
      const byPkg = new Map<string, { rem: number; tot: number }>();
      for (const c of creditRows) {
        const cur = byPkg.get(c.clientPackageId) ?? { rem: 0, tot: 0 };
        cur.rem += c.remainingQty;
        cur.tot += c.totalQty;
        byPkg.set(c.clientPackageId, cur);
      }
      for (const [id, v] of byPkg) {
        if (v.tot > 0 && v.rem === v.tot) unused.add(id);
      }
      for (const p of pkgs) {
        if (p.orderId && unused.has(p.id) && !cancelByOrder.has(p.orderId)) {
          cancelByOrder.set(p.orderId, p.id);
        }
      }
    }
  }

  const [closedOrders] = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "closed"),
        gte(schema.orders.closedAt, start),
        lte(schema.orders.closedAt, end),
        isNull(schema.orders.deletedAt),
        sql`coalesce(${schema.orders.meta}->>'kind','') <> 'staff_consumption'`
      )
    );

  const [openOrders] = await db
    .select({ n: count() })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt),
        sql`coalesce(${schema.orders.meta}->>'kind','') <> 'staff_consumption'`
      )
    );

  const paymentTotalCents = byMethod.reduce((s, r) => s + Number(r.totalCents), 0);
  const byMethodRows = byMethod.map((r) => {
    const totalCents = Number(r.totalCents);
    const meta = {
      brand: r.brand || undefined,
      installments: r.installments != null ? Number(r.installments) : undefined,
      kind: r.kind || undefined,
    };
    const feeCents = paymentFeeCents(totalCents, r.method, meta);
    return {
      method: paymentLabelFromParts(r),
      count: Number(r.n),
      totalCents,
      feeCents,
      netCents: Math.max(0, totalCents - feeCents),
    };
  });
  const paymentFeeTotalCents = byMethodRows.reduce((s, r) => s + r.feeCents, 0);

  return {
    date,
    session,
    openSession,
    movements,
    expectedInCents,
    expectedOutCents,
    expectedBalanceCents: expectedInCents - expectedOutCents,
    paymentTotalCents,
    paymentFeeCents: paymentFeeTotalCents,
    paymentNetCents: Math.max(0, paymentTotalCents - paymentFeeTotalCents),
    paymentCount: payments.length,
    closedOrdersCount: Number(closedOrders?.n ?? 0),
    closedOrdersCents: Number(closedOrders?.total ?? 0),
    openOrdersCount: Number(openOrders?.n ?? 0),
    byMethod: byMethodRows,
    payments: payments.map((p) => ({
      id: p.id,
      paidAt: p.paidAt,
      method: labelStoredPayment(p.method, p.meta),
      amountCents: p.amountCents,
      clientName: p.clientName,
      orderExternalId: p.orderExternalId,
      orderId: p.orderId,
      packageCancelId: cancelByOrder.get(p.orderId) ?? null,
    })),
  };
}

export async function listCashSessions(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<CashSessionSummary[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const to = opts?.to ?? todaySp();
  const from = opts?.from ?? shiftDateSp(to, -30);
  const { start } = dayBoundsSp(from);
  const { end } = dayBoundsSp(to);
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 60));

  const rows = await db
    .select({
      id: schema.cashSessions.id,
      openedAt: schema.cashSessions.openedAt,
      closedAt: schema.cashSessions.closedAt,
      openingCents: schema.cashSessions.openingCents,
      closingCents: schema.cashSessions.closingCents,
      notes: schema.cashSessions.notes,
      openedByUserId: schema.cashSessions.openedByUserId,
      closedByUserId: schema.cashSessions.closedByUserId,
    })
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, tenant.id),
        gte(schema.cashSessions.openedAt, start),
        lte(schema.cashSessions.openedAt, end)
      )
    )
    .orderBy(desc(schema.cashSessions.openedAt))
    .limit(limit);

  const names = await loadUserNames(
    rows.flatMap((r) => [r.openedByUserId, r.closedByUserId])
  );
  return rows.map((r) => toSession(r, names));
}
