import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { paymentFeeCents, paymentFeesFromTenantSettings } from "@/lib/payment-fees";

/** Aplica o desconto de taxa já gravado no meta ao valor bruto de comissão. */
export function applyCardFeeShareToCommissionCents(
  grossCommissionCents: number,
  meta: Record<string, unknown> | null | undefined
): number {
  const share =
    typeof meta?.cardFeeStaffShareCents === "number" &&
    Number.isFinite(meta.cardFeeStaffShareCents)
      ? Math.max(0, Math.round(meta.cardFeeStaffShareCents))
      : 0;
  return Math.max(0, Math.round(grossCommissionCents) - share);
}

/**
 * Taxa de maquininha: 50% salão / 50% desconta da comissão dos profissionais
 * (rateio proporcional ao valor dos serviços da comanda, exceto cortesia/consumo).
 *
 * Só grava `meta.cardFeeStaffShareCents` — a sync de comissão aplica o desconto.
 */
export async function syncOrderCardFeeCommissionShare(
  tenantId: string,
  orderId: string
): Promise<{ feeTotalCents: number; staffShareCents: number; salonShareCents: number }> {
  const db = createDb();

  const [tenant] = await db
    .select({ settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  const fees = paymentFeesFromTenantSettings(
    (tenant?.settings ?? {}) as Record<string, unknown>
  );

  const payments = await db
    .select({
      amountCents: schema.payments.amountCents,
      method: schema.payments.method,
      meta: schema.payments.meta,
    })
    .from(schema.payments)
    .where(
      and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.orderId, orderId))
    );

  let feeTotalCents = 0;
  for (const p of payments) {
    const meta = (p.meta ?? {}) as Record<string, unknown>;
    if (meta.excludedFromCash === true) continue;
    feeTotalCents += paymentFeeCents(p.amountCents, p.method, meta, fees);
  }

  const staffShareCents = Math.floor(feeTotalCents / 2);
  const salonShareCents = feeTotalCents - staffShareCents;

  const serviceItems = await db
    .select({
      id: schema.orderItems.id,
      staffId: schema.orderItems.staffId,
      totalCents: schema.orderItems.totalCents,
      meta: schema.orderItems.meta,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orderItems.orderId, orderId),
        eq(schema.orderItems.itemType, "service"),
        isNull(schema.orders.deletedAt),
        sql`coalesce((${schema.orderItems.meta}->>'staffServiceConsumption'),'') <> 'true'`,
        sql`coalesce((${schema.orderItems.meta}->>'courtesy'),'') <> 'true'`
      )
    );

  const weightSum = serviceItems.reduce((s, it) => s + Math.max(0, it.totalCents), 0);
  const shares = new Map<string, number>();
  if (staffShareCents > 0 && serviceItems.length > 0 && weightSum > 0) {
    let allocated = 0;
    for (let i = 0; i < serviceItems.length; i++) {
      const it = serviceItems[i]!;
      const isLast = i === serviceItems.length - 1;
      const share = isLast
        ? staffShareCents - allocated
        : Math.floor((staffShareCents * Math.max(0, it.totalCents)) / weightSum);
      allocated += share;
      shares.set(it.id, Math.max(0, share));
    }
  }

  for (const it of serviceItems) {
    const meta = { ...((it.meta ?? {}) as Record<string, unknown>) };
    const nextShare = shares.get(it.id) ?? 0;
    const prevShare =
      typeof meta.cardFeeStaffShareCents === "number" ? meta.cardFeeStaffShareCents : 0;
    if (
      prevShare === nextShare &&
      meta.cardFeeSalonShareOrderCents === salonShareCents &&
      meta.cardFeeTotalOrderCents === feeTotalCents
    ) {
      continue;
    }
    meta.cardFeeStaffShareCents = nextShare;
    meta.cardFeeSalonShareOrderCents = salonShareCents;
    meta.cardFeeTotalOrderCents = feeTotalCents;

    await db
      .update(schema.orderItems)
      .set({ meta, updatedAt: new Date() })
      .where(
        and(eq(schema.orderItems.id, it.id), eq(schema.orderItems.tenantId, tenantId))
      );
  }

  return { feeTotalCents, staffShareCents, salonShareCents };
}
