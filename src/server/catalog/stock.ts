import { and, desc, eq, sql } from "drizzle-orm";
import { createDb, schema, type DbTransaction } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export type StockMovementRow = {
  id: string;
  productId: string;
  productName: string;
  deltaQty: number;
  qtyAfter: number;
  reason: string;
  notes: string | null;
  createdAt: Date;
};

const MANUAL_REASONS = new Set(["purchase", "adjust", "return", "internal", "loss"]);

export async function applyStockDeltaTx(
  tx: DbTransaction,
  input: {
    tenantId: string;
    productId: string;
    deltaQty: number;
    reason: string;
    notes?: string | null;
    orderId?: string | null;
    createdByUserId?: string | null;
    allowNegative?: boolean;
  }
): Promise<{ movementId: string; qtyAfter: number }> {
  const delta = Math.trunc(input.deltaQty);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AppError("VALIDATION", "Quantidade inválida");
  }

  const [prod] = await tx
    .select({
      id: schema.products.id,
      stockQty: schema.products.stockQty,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.id, input.productId),
        eq(schema.products.tenantId, input.tenantId)
      )
    )
    .for("update");

  if (!prod) throw new NotFoundError("Produto não encontrado");

  const qtyAfter = prod.stockQty + delta;
  if (!input.allowNegative && qtyAfter < 0) {
    throw new AppError(
      "VALIDATION",
      `Estoque insuficiente (disponível: ${prod.stockQty} un.)`
    );
  }

  await tx
    .update(schema.products)
    .set({ stockQty: qtyAfter, updatedAt: new Date() })
    .where(
      and(eq(schema.products.id, prod.id), eq(schema.products.tenantId, input.tenantId))
    );

  const [row] = await tx
    .insert(schema.stockMovements)
    .values({
      tenantId: input.tenantId,
      productId: input.productId,
      deltaQty: delta,
      qtyAfter,
      reason: input.reason.slice(0, 64),
      notes: input.notes?.trim() ? input.notes.trim().slice(0, 240) : null,
      orderId: input.orderId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning({ id: schema.stockMovements.id });

  return { movementId: row!.id, qtyAfter };
}

export async function postStockMovement(input: {
  productId: string;
  kind: "in" | "out";
  qty: number;
  reason: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "catalog.write");
    const tenant = await requireTenantContext();

    const qty = Math.trunc(Number(input.qty));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new AppError("VALIDATION", "Informe uma quantidade maior que zero");
    }
    if (!MANUAL_REASONS.has(input.reason)) {
      throw new AppError("VALIDATION", "Motivo inválido");
    }

    const deltaQty = input.kind === "in" ? qty : -qty;
    const db = createDb();
    const applied = await db.transaction((tx) =>
      applyStockDeltaTx(tx, {
        tenantId: tenant.id,
        productId: input.productId,
        deltaQty,
        reason: input.reason,
        notes: input.notes,
        createdByUserId: session.user.id,
      })
    );

    return { ok: true, id: applied.movementId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível movimentar o estoque" };
  }
}

export async function listRecentStockMovements(opts?: {
  limit?: number;
}): Promise<StockMovementRow[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const limit = Math.max(1, Math.min(100, opts?.limit ?? 40));

  const rows = await db
    .select({
      id: schema.stockMovements.id,
      productId: schema.stockMovements.productId,
      productName: schema.products.name,
      deltaQty: schema.stockMovements.deltaQty,
      qtyAfter: schema.stockMovements.qtyAfter,
      reason: schema.stockMovements.reason,
      notes: schema.stockMovements.notes,
      createdAt: schema.stockMovements.createdAt,
    })
    .from(schema.stockMovements)
    .innerJoin(schema.products, eq(schema.stockMovements.productId, schema.products.id))
    .where(eq(schema.stockMovements.tenantId, tenant.id))
    .orderBy(desc(schema.stockMovements.createdAt))
    .limit(limit);

  return rows;
}

export function labelStockReason(reason: string): string {
  const map: Record<string, string> = {
    purchase: "Compra / entrada",
    adjust: "Ajuste manual",
    return: "Devolução",
    internal: "Uso interno",
    loss: "Perda / quebra",
    sale: "Venda",
  };
  return map[reason] ?? reason;
}

/** Garante que a tabela existe em ambientes sem migrate completo. */
export async function ensureStockMovementsTable(): Promise<void> {
  const db = createDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      delta_qty integer NOT NULL,
      qty_after integer NOT NULL,
      reason varchar(64) NOT NULL,
      notes varchar(240),
      order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
