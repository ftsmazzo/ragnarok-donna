import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { extraServiceBaseCents } from "@/lib/commission-policy";
import { rangeBoundsSp, resolveReportPeriod } from "@/lib/datetime";
import { requireTenantContext, requireSession } from "@/server/context/tenant";
import { hasCapability } from "@/server/permissions/capabilities";
import { AppError, ForbiddenError } from "@/server/errors";

export type ExtrasRankingRow = {
  staffId: string;
  staffName: string;
  qty: number;
  cents: number;
  /** Itens de serviço fechados no período */
  serviceItems: number;
  /** Clientes distintos atendidos (serviço) no período */
  clientsServed: number;
  goalCents: number;
  goalQty: number | null;
  progressPct: number | null;
};

export type ExtrasRankingReport = {
  from: string;
  to: string;
  period: "today" | "tomorrow" | "last7" | "week" | "last30" | "month" | "custom";
  rows: ExtrasRankingRow[];
  totalCents: number;
  totalQty: number;
  totalServiceItems: number;
  totalClientsServed: number;
  canWriteGoals: boolean;
};

type Db = ReturnType<typeof createDb>;

export type ExtraServiceStaffTotal = {
  staffId: string;
  staffName: string | null;
  qty: number;
  cents: number;
};

/** Serviços extra fechados no intervalo (mesma classificação da comissão). */
export async function sumClosedExtraServicesByStaff(
  db: Db,
  tenantId: string,
  startIso: string,
  endIso: string
): Promise<ExtraServiceStaffTotal[]> {
  const lines = await db
    .select({
      staffId: schema.orderItems.staffId,
      staffName: schema.staff.name,
      qty: schema.orderItems.qty,
      totalCents: schema.orderItems.totalCents,
      unitPriceCents: schema.orderItems.unitPriceCents,
      commissionBps: schema.orderItems.commissionBps,
      commissionCents: schema.orderItems.commissionCents,
      meta: schema.orderItems.meta,
      description: schema.orderItems.description,
      serviceName: schema.services.name,
      categoryName: schema.serviceCategories.name,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
    .leftJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
    .leftJoin(
      schema.serviceCategories,
      eq(schema.services.categoryId, schema.serviceCategories.id)
    )
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orders.status, "closed"),
        eq(schema.orderItems.itemType, "service"),
        sql`${schema.orders.closedAt} >= ${startIso}::timestamptz`,
        sql`${schema.orders.closedAt} <= ${endIso}::timestamptz`
      )
    );

  const byStaff = new Map<string, ExtraServiceStaffTotal>();
  for (const line of lines) {
    if (!line.staffId) continue;
    const name = (line.serviceName || line.description || "").replace(/\s·\sPacote.*$/i, "");
    const cents = extraServiceBaseCents({
      name,
      category: line.categoryName,
      totalCents: line.totalCents,
      unitPriceCents: line.unitPriceCents,
      qty: line.qty,
      commissionBps: line.commissionBps,
      commissionCents: line.commissionCents,
      meta: line.meta,
    });
    if (cents == null) continue;
    const current = byStaff.get(line.staffId) ?? {
      staffId: line.staffId,
      staffName: line.staffName,
      qty: 0,
      cents: 0,
    };
    current.qty += Math.max(1, line.qty);
    current.cents += cents;
    byStaff.set(line.staffId, current);
  }
  return [...byStaff.values()].sort((a, b) => b.cents - a.cents);
}

export async function reportExtrasRanking(input?: {
  from?: string;
  to?: string;
  period?: string;
}): Promise<ExtrasRankingReport> {
  const tenant = await requireTenantContext();
  const session = await requireSession();
  const db = createDb();

  const resolved = resolveReportPeriod({
    period: input?.period,
    from: input?.from,
    to: input?.to,
  });
  const { start, end } = rangeBoundsSp(resolved.from, resolved.to);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [sales, services, goals, staffList] = await Promise.all([
    sumClosedExtraServicesByStaff(db, tenant.id, startIso, endIso),
    db
      .select({
        staffId: schema.orderItems.staffId,
        serviceItems: sql<number>`count(*)::int`.as("service_items"),
        clientsServed: sql<number>`count(distinct ${schema.orders.clientId})::int`.as(
          "clients_served"
        ),
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(
        and(
          eq(schema.orderItems.tenantId, tenant.id),
          eq(schema.orders.status, "closed"),
          eq(schema.orderItems.itemType, "service"),
          sql`${schema.orders.clientId} is not null`,
          sql`${schema.orders.closedAt} >= ${startIso}::timestamptz`,
          sql`${schema.orders.closedAt} <= ${endIso}::timestamptz`
        )
      )
      .groupBy(schema.orderItems.staffId),
    db
      .select({
        staffId: schema.staffExtrasGoals.staffId,
        monthlyTargetCents: schema.staffExtrasGoals.monthlyTargetCents,
        monthlyTargetQty: schema.staffExtrasGoals.monthlyTargetQty,
      })
      .from(schema.staffExtrasGoals)
      .where(eq(schema.staffExtrasGoals.tenantId, tenant.id)),
    db
      .select({ id: schema.staff.id, name: schema.staff.name })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.tenantId, tenant.id),
          eq(schema.staff.isActive, true),
          isNull(schema.staff.deletedAt)
        )
      )
      .orderBy(asc(schema.staff.name)),
  ]);

  const goalByStaff = new Map(
    goals.map((g) => [
      g.staffId,
      { cents: g.monthlyTargetCents, qty: g.monthlyTargetQty },
    ])
  );
  const soldByStaff = new Map(
    sales.map((s) => [s.staffId, { name: s.staffName, qty: s.qty, cents: s.cents }])
  );
  const serviceByStaff = new Map(
    services
      .filter((s) => s.staffId)
      .map((s) => [
        s.staffId as string,
        {
          serviceItems: Number(s.serviceItems ?? 0),
          clientsServed: Number(s.clientsServed ?? 0),
        },
      ])
  );

  const rows: ExtrasRankingRow[] = staffList.map((s) => {
    const sold = soldByStaff.get(s.id) ?? { name: s.name, qty: 0, cents: 0 };
    const svc = serviceByStaff.get(s.id) ?? { serviceItems: 0, clientsServed: 0 };
    const goal = goalByStaff.get(s.id);
    const goalCents = goal?.cents ?? 0;
    const progressPct =
      goalCents > 0 ? Math.round((sold.cents / goalCents) * 1000) / 10 : null;
    return {
      staffId: s.id,
      staffName: s.name,
      qty: sold.qty,
      cents: sold.cents,
      serviceItems: svc.serviceItems,
      clientsServed: svc.clientsServed,
      goalCents,
      goalQty: goal?.qty ?? null,
      progressPct,
    };
  });

  rows.sort((a, b) => b.cents - a.cents || a.staffName.localeCompare(b.staffName, "pt-BR"));

  return {
    from: resolved.from,
    to: resolved.to,
    period: resolved.period,
    rows,
    totalCents: rows.reduce((acc, r) => acc + r.cents, 0),
    totalQty: rows.reduce((acc, r) => acc + r.qty, 0),
    totalServiceItems: rows.reduce((acc, r) => acc + r.serviceItems, 0),
    totalClientsServed: rows.reduce((acc, r) => acc + r.clientsServed, 0),
    canWriteGoals: hasCapability(session.role, "commissions.write"),
  };
}

export async function upsertStaffExtrasGoal(input: {
  staffId: string;
  monthlyTargetCents: number;
  monthlyTargetQty?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const tenant = await requireTenantContext();
    const session = await requireSession();
    if (!hasCapability(session.role, "commissions.write")) {
      throw new ForbiddenError("Sem permissão para editar metas");
    }
    if (!input.staffId) {
      throw new AppError("VALIDATION", "Profissional obrigatório");
    }
    if (input.monthlyTargetCents < 0) {
      throw new AppError("VALIDATION", "Meta não pode ser negativa");
    }

    const db = createDb();
    const now = new Date();
    const qty =
      input.monthlyTargetQty == null || Number.isNaN(input.monthlyTargetQty)
        ? null
        : Math.max(0, Math.floor(input.monthlyTargetQty));

    await db
      .insert(schema.staffExtrasGoals)
      .values({
        tenantId: tenant.id,
        staffId: input.staffId,
        monthlyTargetCents: Math.round(input.monthlyTargetCents),
        monthlyTargetQty: qty,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.staffExtrasGoals.tenantId, schema.staffExtrasGoals.staffId],
        set: {
          monthlyTargetCents: Math.round(input.monthlyTargetCents),
          monthlyTargetQty: qty,
          updatedAt: now,
        },
      });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao salvar meta",
    };
  }
}
