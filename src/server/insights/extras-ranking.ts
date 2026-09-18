import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
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

  const [sales, services, goals, staffList] = await Promise.all([
    db
      .select({
        staffId: schema.orderItems.staffId,
        staffName: schema.staff.name,
        qty: sql<number>`coalesce(sum(${schema.orderItems.qty}), 0)::int`.as("qty"),
        cents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`.as(
          "cents"
        ),
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
      .where(
        and(
          eq(schema.orderItems.tenantId, tenant.id),
          eq(schema.orders.status, "closed"),
          eq(schema.orderItems.itemType, "product"),
          sql`${schema.orders.closedAt} >= ${start.toISOString()}::timestamptz`,
          sql`${schema.orders.closedAt} <= ${end.toISOString()}::timestamptz`
        )
      )
      .groupBy(schema.orderItems.staffId, schema.staff.name)
      .orderBy(sql`sum(${schema.orderItems.totalCents}) desc`),
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
          sql`${schema.orders.closedAt} >= ${start.toISOString()}::timestamptz`,
          sql`${schema.orders.closedAt} <= ${end.toISOString()}::timestamptz`
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
    sales
      .filter((s) => s.staffId && s.staffName)
      .map((s) => [
        s.staffId as string,
        { name: s.staffName as string, qty: s.qty ?? 0, cents: s.cents ?? 0 },
      ])
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
