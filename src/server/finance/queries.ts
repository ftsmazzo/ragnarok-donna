import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, todaySp } from "@/lib/datetime";
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

    movements = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      direction: (r.direction === "out" ? "out" : "in") as "in" | "out",
      method: r.method,
      amountCents: r.amountCents,
      description: r.description,
      orderId: r.orderId,
      orderExternalId: r.orderExternalId,
      clientName: r.clientName,
    }));
  }

  const expectedInCents =
    (sessionForMovements?.openingCents ?? 0) +
    movements.filter((m) => m.direction === "in").reduce((s, m) => s + m.amountCents, 0);
  const expectedOutCents = movements
    .filter((m) => m.direction === "out")
    .reduce((s, m) => s + m.amountCents, 0);

  const byMethod = await db
    .select({
      method: schema.payments.method,
      n: count(),
      totalCents: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, tenant.id),
        gte(schema.payments.paidAt, start),
        lte(schema.payments.paidAt, end)
      )
    )
    .groupBy(schema.payments.method)
    .orderBy(desc(sql`sum(${schema.payments.amountCents})`));

  const payments = await db
    .select({
      id: schema.payments.id,
      paidAt: schema.payments.paidAt,
      method: schema.payments.method,
      amountCents: schema.payments.amountCents,
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
        lte(schema.payments.paidAt, end)
      )
    )
    .orderBy(desc(schema.payments.paidAt));

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
        isNull(schema.orders.deletedAt)
      )
    );

  const [openOrders] = await db
    .select({ n: count() })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt)
      )
    );

  const paymentTotalCents = byMethod.reduce((s, r) => s + Number(r.totalCents), 0);

  return {
    date,
    session,
    openSession,
    movements,
    expectedInCents,
    expectedOutCents,
    expectedBalanceCents: expectedInCents - expectedOutCents,
    paymentTotalCents,
    paymentCount: payments.length,
    closedOrdersCount: Number(closedOrders?.n ?? 0),
    closedOrdersCents: Number(closedOrders?.total ?? 0),
    openOrdersCount: Number(openOrders?.n ?? 0),
    byMethod: byMethod.map((r) => ({
      method: r.method,
      count: Number(r.n),
      totalCents: Number(r.totalCents),
    })),
    payments,
  };
}
