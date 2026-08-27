import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { monthStartSp, rangeBoundsSp, todaySp } from "@/lib/datetime";
import { PAGE_SIZE } from "@/lib/cadastros";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability, requireCapability } from "../permissions";
import { findOpenCashSessionId } from "../finance/queries";

const commissionExpr = sql<number>`coalesce(
  ${schema.orderItems.commissionCents},
  (${schema.orderItems.totalCents} * coalesce(${schema.orderItems.commissionBps}, 0) / 10000)
)::int`;

export type AdvanceKind = "vale" | "bonus" | "discount" | "payout";

export type CommissionStaffRow = {
  staffId: string | null;
  staffName: string | null;
  itemCount: number;
  revenueCents: number;
  commissionCents: number;
  valeCents: number;
  bonusCents: number;
  discountCents: number;
  payoutCents: number;
  netDueCents: number;
};

export type CommissionItemRow = {
  id: string;
  performedAt: Date | null;
  staffName: string | null;
  description: string;
  itemType: string;
  totalCents: number;
  commissionBps: number | null;
  commissionCents: number;
  clientName: string | null;
};

export type AdvanceRow = {
  id: string;
  staffId: string;
  staffName: string | null;
  kind: AdvanceKind;
  status: string;
  amountCents: number;
  occurredAt: Date;
  notes: string | null;
};

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

function netDue(parts: {
  commissionCents: number;
  valeCents: number;
  bonusCents: number;
  discountCents: number;
  payoutCents: number;
}) {
  return (
    parts.commissionCents -
    parts.valeCents -
    parts.discountCents +
    parts.bonusCents -
    parts.payoutCents
  );
}

export async function reportCommissions(opts: {
  from?: string;
  to?: string;
  staffId?: string;
  itemType?: string;
  page?: number;
}) {
  const tenant = await requireTenantContext();
  const db = createDb();
  const from = opts.from ?? monthStartSp();
  const to = opts.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const page = Math.max(1, opts.page ?? 1);
  const itemType = opts.itemType?.trim();

  let itemWhere = and(
    eq(schema.orderItems.tenantId, tenant.id),
    eq(schema.orders.tenantId, tenant.id),
    eq(schema.orders.status, "closed"),
    isNull(schema.orders.deletedAt),
    gte(schema.orderItems.performedAt, start),
    lte(schema.orderItems.performedAt, end)
  );

  if (opts.staffId) {
    itemWhere = and(itemWhere, eq(schema.orderItems.staffId, opts.staffId));
  }
  if (itemType && itemType !== "all") {
    itemWhere = and(itemWhere, eq(schema.orderItems.itemType, itemType as "service"));
  }

  const byStaff = await db
    .select({
      staffId: schema.orderItems.staffId,
      staffName: schema.staff.name,
      itemCount: count(),
      revenueCents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
      commissionCents: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
    .where(itemWhere)
    .groupBy(schema.orderItems.staffId, schema.staff.name)
    .orderBy(desc(sql`sum(${commissionExpr})`));

  const advanceWhere = [
    eq(schema.staffAdvances.tenantId, tenant.id),
    ne(schema.staffAdvances.status, "cancelled"),
    gte(schema.staffAdvances.occurredAt, start),
    lte(schema.staffAdvances.occurredAt, end),
  ];
  if (opts.staffId) advanceWhere.push(eq(schema.staffAdvances.staffId, opts.staffId));

  const advanceRows = await db
    .select({
      staffId: schema.staffAdvances.staffId,
      kind: schema.staffAdvances.kind,
      total: sql<number>`coalesce(sum(${schema.staffAdvances.amountCents}), 0)::int`,
    })
    .from(schema.staffAdvances)
    .where(and(...advanceWhere))
    .groupBy(schema.staffAdvances.staffId, schema.staffAdvances.kind);

  const advanceMap = new Map<
    string,
    { vale: number; bonus: number; discount: number; payout: number }
  >();
  for (const row of advanceRows) {
    const cur = advanceMap.get(row.staffId) ?? {
      vale: 0,
      bonus: 0,
      discount: 0,
      payout: 0,
    };
    cur[row.kind as keyof typeof cur] = Number(row.total);
    advanceMap.set(row.staffId, cur);
  }

  const enriched: CommissionStaffRow[] = byStaff.map((s) => {
    const adv = s.staffId
      ? advanceMap.get(s.staffId) ?? { vale: 0, bonus: 0, discount: 0, payout: 0 }
      : { vale: 0, bonus: 0, discount: 0, payout: 0 };
    const commissionCents = Number(s.commissionCents);
    const parts = {
      commissionCents,
      valeCents: adv.vale,
      bonusCents: adv.bonus,
      discountCents: adv.discount,
      payoutCents: adv.payout,
    };
    return {
      staffId: s.staffId,
      staffName: s.staffName,
      itemCount: Number(s.itemCount),
      revenueCents: Number(s.revenueCents),
      ...parts,
      netDueCents: netDue(parts),
    };
  });

  // Staff with only advances (no closed items) still appear
  if (!opts.staffId) {
    const missingIds = [...advanceMap.keys()].filter(
      (id) => !enriched.some((e) => e.staffId === id)
    );
    if (missingIds.length) {
      const names = await db
        .select({ id: schema.staff.id, name: schema.staff.name })
        .from(schema.staff)
        .where(and(eq(schema.staff.tenantId, tenant.id), inArray(schema.staff.id, missingIds)));
      const nameMap = new Map(names.map((n) => [n.id, n.name]));
      for (const staffId of missingIds) {
        const adv = advanceMap.get(staffId)!;
        const parts = {
          commissionCents: 0,
          valeCents: adv.vale,
          bonusCents: adv.bonus,
          discountCents: adv.discount,
          payoutCents: adv.payout,
        };
        enriched.push({
          staffId,
          staffName: nameMap.get(staffId) ?? null,
          itemCount: 0,
          revenueCents: 0,
          ...parts,
          netDueCents: netDue(parts),
        });
      }
    }
  }

  const [totals] = await db
    .select({
      n: count(),
      revenue: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
      commission: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(itemWhere);

  const items = await db
    .select({
      id: schema.orderItems.id,
      performedAt: schema.orderItems.performedAt,
      staffName: schema.staff.name,
      description: schema.orderItems.description,
      itemType: schema.orderItems.itemType,
      totalCents: schema.orderItems.totalCents,
      commissionBps: schema.orderItems.commissionBps,
      commissionCents: commissionExpr.as("commission_cents"),
      clientName: schema.clients.name,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(itemWhere)
    .orderBy(desc(schema.orderItems.performedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const byTypeRows = await db
    .select({
      itemType: schema.orderItems.itemType,
      n: count(),
      commission: sql<number>`coalesce(sum(${commissionExpr}), 0)::int`,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(itemWhere)
    .groupBy(schema.orderItems.itemType)
    .orderBy(desc(sql`sum(${commissionExpr})`));

  const advances = await db
    .select({
      id: schema.staffAdvances.id,
      staffId: schema.staffAdvances.staffId,
      staffName: schema.staff.name,
      kind: schema.staffAdvances.kind,
      status: schema.staffAdvances.status,
      amountCents: schema.staffAdvances.amountCents,
      occurredAt: schema.staffAdvances.occurredAt,
      notes: schema.staffAdvances.notes,
    })
    .from(schema.staffAdvances)
    .leftJoin(schema.staff, eq(schema.staffAdvances.staffId, schema.staff.id))
    .where(and(...advanceWhere))
    .orderBy(desc(schema.staffAdvances.occurredAt))
    .limit(80);

  const staffList = await db
    .select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff)
    .where(and(eq(schema.staff.tenantId, tenant.id), isNull(schema.staff.deletedAt)))
    .orderBy(asc(schema.staff.name));

  const totalCommissionCents = Number(totals?.commission ?? 0);
  const totalVale = enriched.reduce((s, r) => s + r.valeCents, 0);
  const totalBonus = enriched.reduce((s, r) => s + r.bonusCents, 0);
  const totalDiscount = enriched.reduce((s, r) => s + r.discountCents, 0);
  const totalPayout = enriched.reduce((s, r) => s + r.payoutCents, 0);
  const totalNet = netDue({
    commissionCents: totalCommissionCents,
    valeCents: totalVale,
    bonusCents: totalBonus,
    discountCents: totalDiscount,
    payoutCents: totalPayout,
  });

  const session = await requireSession();
  const total = Number(totals?.n ?? 0);

  return {
    from,
    to,
    staffId: opts.staffId ?? "",
    itemType: itemType && itemType !== "all" ? itemType : "all",
    byStaff: enriched.sort((a, b) => b.netDueCents - a.netDueCents),
    byType: byTypeRows.map((r) => ({
      itemType: r.itemType,
      itemCount: Number(r.n),
      commissionCents: Number(r.commission),
    })),
    advances: advances as AdvanceRow[],
    items: items as CommissionItemRow[],
    totalItems: total,
    totalRevenueCents: Number(totals?.revenue ?? 0),
    totalCommissionCents,
    totalValeCents: totalVale,
    totalBonusCents: totalBonus,
    totalDiscountCents: totalDiscount,
    totalPayoutCents: totalPayout,
    totalNetDueCents: totalNet,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    staffList,
    canWrite: hasCapability(session.role, "commissions.write"),
  };
}

export async function createStaffAdvance(input: {
  staffId: string;
  kind: AdvanceKind;
  amountCents: number;
  notes?: string;
  occurredAt?: Date;
  linkCashOut?: boolean;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "commissions.write");
    const tenant = await requireTenantContext();

    const amountCents = Math.round(input.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new AppError("VALIDATION", "Valor inválido");
    }
    if (!["vale", "bonus", "discount", "payout"].includes(input.kind)) {
      throw new AppError("VALIDATION", "Tipo inválido");
    }

    const db = createDb();
    const [staff] = await db
      .select({ id: schema.staff.id, name: schema.staff.name })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.id, input.staffId),
          eq(schema.staff.tenantId, tenant.id),
          isNull(schema.staff.deletedAt)
        )
      )
      .limit(1);
    if (!staff) throw new AppError("NOT_FOUND", "Profissional não encontrado");

    let cashMovementId: string | null = null;
    if (input.linkCashOut && input.kind === "vale") {
      const openId = await findOpenCashSessionId(tenant.id);
      if (!openId) {
        throw new AppError("VALIDATION", "Abra o caixa para lançar o vale no caixa");
      }
      const [mov] = await db
        .insert(schema.cashMovements)
        .values({
          tenantId: tenant.id,
          cashSessionId: openId,
          direction: "out",
          method: "cash",
          amountCents,
          description: `Vale — ${staff.name}`,
        })
        .returning({ id: schema.cashMovements.id });
      cashMovementId = mov.id;
    }

    const status = input.kind === "payout" ? "settled" : "open";
    const [row] = await db
      .insert(schema.staffAdvances)
      .values({
        tenantId: tenant.id,
        staffId: input.staffId,
        kind: input.kind,
        status,
        amountCents,
        occurredAt: input.occurredAt ?? new Date(),
        notes: input.notes?.trim() || null,
        cashMovementId,
        createdByUserId: session.user.id,
        settledAt: status === "settled" ? new Date() : null,
      })
      .returning({ id: schema.staffAdvances.id });

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível registrar o lançamento" };
  }
}

export async function getCashFlowReport(opts?: { from?: string; to?: string }) {
  await requireSession();
  const tenant = await requireTenantContext();
  const db = createDb();
  const from = opts?.from ?? monthStartSp();
  const to = opts?.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);

  const methodRows = await db
    .select({
      method: schema.payments.method,
      n: count(),
      total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
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

  const seriesRows = await db
    .select({
      day: sql<string>`to_char((${schema.payments.paidAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`,
      total: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, tenant.id),
        gte(schema.payments.paidAt, start),
        lte(schema.payments.paidAt, end)
      )
    )
    .groupBy(sql`to_char((${schema.payments.paidAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`)
    .orderBy(asc(sql`to_char((${schema.payments.paidAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`));

  const [moves] = await db
    .select({
      inCents: sql<number>`coalesce(sum(case when ${schema.cashMovements.direction} = 'in' then ${schema.cashMovements.amountCents} else 0 end), 0)::int`,
      outCents: sql<number>`coalesce(sum(case when ${schema.cashMovements.direction} = 'out' then ${schema.cashMovements.amountCents} else 0 end), 0)::int`,
    })
    .from(schema.cashMovements)
    .where(
      and(
        eq(schema.cashMovements.tenantId, tenant.id),
        gte(schema.cashMovements.createdAt, start),
        lte(schema.cashMovements.createdAt, end)
      )
    );

  const [vales] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.staffAdvances.amountCents}), 0)::int`,
      n: count(),
    })
    .from(schema.staffAdvances)
    .where(
      and(
        eq(schema.staffAdvances.tenantId, tenant.id),
        eq(schema.staffAdvances.kind, "vale"),
        ne(schema.staffAdvances.status, "cancelled"),
        gte(schema.staffAdvances.occurredAt, start),
        lte(schema.staffAdvances.occurredAt, end)
      )
    );

  const totalPayments = methodRows.reduce((s, r) => s + Number(r.total), 0);
  const availableMethods = new Set(["cash", "pix", "debit"]);
  const availableCents = methodRows
    .filter((r) => availableMethods.has(r.method))
    .reduce((s, r) => s + Number(r.total), 0);
  const creditCents = methodRows
    .filter((r) => r.method === "credit")
    .reduce((s, r) => s + Number(r.total), 0);

  return {
    from,
    to,
    totalMovedCents: totalPayments,
    availableCents,
    creditCents,
    cashInCents: Number(moves?.inCents ?? 0),
    cashOutCents: Number(moves?.outCents ?? 0),
    valeCents: Number(vales?.total ?? 0),
    valeCount: Number(vales?.n ?? 0),
    byMethod: methodRows.map((r) => ({
      name: r.method,
      value: Number(r.total) / 100,
      extra: Number(r.n),
    })),
    series: seriesRows.map((r) => {
      const key = String(r.day);
      const [, m, d] = key.split("-");
      return { key, label: `${d}/${m}`, value: Number(r.total) / 100 };
    }),
  };
}

export function canWriteCommissions(role: string): boolean {
  return hasCapability(role as "owner", "commissions.write");
}
