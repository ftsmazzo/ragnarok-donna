import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { monthStartOfSp, rangeBoundsSp, shiftMonthSp, formatDateSp } from "@/lib/datetime";
import {
  classifyServiceCommission,
  commissionCentsFrom,
  packageCreditBaseCents,
  type ServiceCommissionKind,
} from "@/lib/commission-policy";

type Db = ReturnType<typeof createDb>;

function monthRange(at = new Date()) {
  const day = formatDateSp(at);
  const from = monthStartOfSp(day);
  const to = shiftMonthSp(from, 1);
  const start = rangeBoundsSp(from, from).start;
  const end = rangeBoundsSp(to, to).start;
  return { start, endExclusive: end };
}

export async function packageSliceCents(
  db: Db,
  tenantId: string,
  clientPackageId: string
): Promise<number | null> {
  const [row] = await db
    .select({
      priceCents: schema.packages.priceCents,
      items: schema.packages.items,
    })
    .from(schema.clientPackages)
    .innerJoin(schema.packages, eq(schema.clientPackages.packageId, schema.packages.id))
    .where(
      and(
        eq(schema.clientPackages.id, clientPackageId),
        eq(schema.clientPackages.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!row) return null;
  const count = (row.items ?? []).reduce((sum, item) => sum + Math.max(0, item.qty || 0), 0);
  return packageCreditBaseCents(row.priceCents, count);
}

/**
 * Recalcula comissão dos serviços do profissional no mês (SP).
 * Base = % do serviço no catálogo; se vazio, % padrão do profissional.
 * Não força 40% da casa (isso quebrava Donna / variações AppBarber).
 * Venda de pacote continua sem comissão (0) até o uso do crédito.
 */
export async function syncStaffMonthServiceCommission(
  tenantId: string,
  staffId: string | null | undefined,
  at = new Date()
): Promise<void> {
  if (!staffId) return;
  const db = createDb();
  const { start, endExclusive } = monthRange(at);
  const when = sql`coalesce(${schema.orderItems.performedAt}, ${schema.orderItems.createdAt})`;

  const [staffRow] = await db
    .select({ defaultCommissionBps: schema.staff.defaultCommissionBps })
    .from(schema.staff)
    .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenantId)))
    .limit(1);
  const staffDefaultBps = staffRow?.defaultCommissionBps ?? null;

  const rows = await db
    .select({
      id: schema.orderItems.id,
      description: schema.orderItems.description,
      totalCents: schema.orderItems.totalCents,
      unitPriceCents: schema.orderItems.unitPriceCents,
      qty: schema.orderItems.qty,
      meta: schema.orderItems.meta,
      commissionBps: schema.orderItems.commissionBps,
      commissionCents: schema.orderItems.commissionCents,
      serviceName: schema.services.name,
      serviceCommissionBps: schema.services.commissionBps,
      categoryName: schema.serviceCategories.name,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .leftJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
    .leftJoin(
      schema.serviceCategories,
      eq(schema.services.categoryId, schema.serviceCategories.id)
    )
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orderItems.staffId, staffId),
        eq(schema.orderItems.itemType, "service"),
        inArray(schema.orders.status, ["open", "closed"]),
        isNull(schema.orders.deletedAt),
        gte(when, start),
        lt(when, endExclusive)
      )
    );

  await db
    .update(schema.orderItems)
    .set({ commissionBps: 0, commissionCents: 0, updatedAt: new Date() })
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orderItems.staffId, staffId),
        eq(schema.orderItems.itemType, "package"),
        gte(when, start),
        lt(when, endExclusive)
      )
    );

  for (const row of rows) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const name = (row.serviceName || row.description || "").replace(/\s·\sPacote.*$/i, "");
    const kind = classifyServiceCommission(name, row.categoryName);

    let base = row.totalCents;
    if (meta.courtesy) {
      base = 0;
    } else if (typeof meta.commissionBaseCents === "number" && meta.commissionBaseCents >= 0) {
      base = meta.commissionBaseCents;
    } else if (meta.redeemed && typeof meta.clientPackageId === "string") {
      const slice = await packageSliceCents(db, tenantId, meta.clientPackageId);
      base = slice ?? row.unitPriceCents * Math.max(1, row.qty);
    } else if (base <= 0) {
      base = row.unitPriceCents * Math.max(1, row.qty);
    }

    const bps =
      base <= 0
        ? 0
        : row.serviceCommissionBps != null && row.serviceCommissionBps >= 0
          ? row.serviceCommissionBps
          : staffDefaultBps != null && staffDefaultBps >= 0
            ? staffDefaultBps
            : null;

    const cents = bps == null ? 0 : commissionCentsFrom(base, bps);
    const nextBps = bps == null ? null : bps;
    const nextMeta = {
      ...meta,
      commissionKind: kind,
      commissionBaseCents: base,
    };

    if (
      row.commissionBps === nextBps &&
      row.commissionCents === cents &&
      meta.commissionKind === kind &&
      meta.commissionBaseCents === base
    ) {
      continue;
    }

    await db
      .update(schema.orderItems)
      .set({
        commissionBps: nextBps,
        commissionCents: cents,
        meta: nextMeta,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.orderItems.id, row.id), eq(schema.orderItems.tenantId, tenantId)));
  }
}

/** Recalcula comissão do mês (SP) de cada profissional do tenant a partir do catálogo. */
export async function syncTenantMonthServiceCommission(
  tenantId: string,
  at = new Date()
): Promise<void> {
  const db = createDb();
  const { start, endExclusive } = monthRange(at);
  const when = sql`coalesce(${schema.orderItems.performedAt}, ${schema.orderItems.createdAt})`;
  const staffRows = await db
    .selectDistinct({ staffId: schema.orderItems.staffId })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orderItems.itemType, "service"),
        inArray(schema.orders.status, ["open", "closed"]),
        isNull(schema.orders.deletedAt),
        gte(when, start),
        lt(when, endExclusive)
      )
    );
  for (const row of staffRows) {
    if (row.staffId) await syncStaffMonthServiceCommission(tenantId, row.staffId, at);
  }
}

export async function annotateServiceCommission(input: {
  tenantId: string;
  serviceName: string;
  categoryName?: string | null;
  baseCents: number;
  clientPackageId?: string | null;
}): Promise<{ kind: ServiceCommissionKind; baseCents: number; metaPatch: Record<string, unknown> }> {
  let base = input.baseCents;
  if (input.clientPackageId) {
    const slice = await packageSliceCents(createDb(), input.tenantId, input.clientPackageId);
    if (slice != null) base = slice;
  }
  const kind = classifyServiceCommission(input.serviceName, input.categoryName);
  return {
    kind,
    baseCents: base,
    metaPatch: { commissionKind: kind, commissionBaseCents: base },
  };
}
