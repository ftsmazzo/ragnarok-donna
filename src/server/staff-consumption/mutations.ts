import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { staffConsumptionAmountCents } from "@/lib/staff-consumption";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { isBarberRole } from "../permissions/roles";

export type ActionResult = { ok: true; id: string; amountCents?: number } | { ok: false; error: string };

/**
 * Consumo do profissional (venda − 30%).
 * A loja pediu para a recepção lançar na comanda — barbeiro não usa mais o atalho do celular.
 */
export async function registerStaffProductConsumption(input: {
  productId: string;
  qty?: number;
  /** Dono/admin pode lançar em nome de um profissional. */
  staffId?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const tenant = await requireTenantContext();
    const qty = Math.max(1, Math.min(99, input.qty ?? 1));
    const db = createDb();

    let staffId: string | null = null;
    if (isBarberRole(session.role)) {
      throw new ForbiddenError(
        "Consumo do profissional: a recepção lança na comanda. O atalho no celular foi desligado."
      );
    } else if (hasCapability(session.role, "commissions.write")) {
      staffId = input.staffId?.trim() || null;
      if (!staffId) {
        throw new AppError("VALIDATION", "Informe o profissional");
      }
    } else {
      throw new ForbiddenError("Sem permissão para lançar consumo");
    }

    const [prod] = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        priceCents: schema.products.priceCents,
        stockQty: schema.products.stockQty,
        forSale: schema.products.forSale,
        isActive: schema.products.isActive,
      })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, input.productId),
          eq(schema.products.tenantId, tenant.id),
          isNull(schema.products.deletedAt)
        )
      )
      .limit(1);

    if (!prod) throw new NotFoundError("Produto não encontrado");
    if (!prod.isActive || !prod.forSale) {
      throw new AppError("VALIDATION", "Produto não disponível para consumo");
    }
    if (prod.stockQty < qty) {
      throw new AppError("VALIDATION", `Estoque insuficiente (${prod.stockQty} un.)`);
    }

    const [staff] = await db
      .select({ id: schema.staff.id, name: schema.staff.name })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.id, staffId),
          eq(schema.staff.tenantId, tenant.id),
          isNull(schema.staff.deletedAt)
        )
      )
      .limit(1);
    if (!staff) throw new AppError("VALIDATION", "Profissional inválido");

    const amountCents = staffConsumptionAmountCents(prod.priceCents, qty);
    const note = `Consumo: ${prod.name}${qty > 1 ? ` ×${qty}` : ""} (venda −30%)`;

    await db
      .update(schema.products)
      .set({
        stockQty: sql`${schema.products.stockQty} - ${qty}`,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.products.id, prod.id), eq(schema.products.tenantId, tenant.id)));

    const [row] = await db
      .insert(schema.staffAdvances)
      .values({
        tenantId: tenant.id,
        staffId: staff.id,
        kind: "discount",
        status: "open",
        amountCents,
        occurredAt: new Date(),
        notes: note.slice(0, 240),
        createdByUserId: session.user.id,
      })
      .returning({ id: schema.staffAdvances.id });

    return { ok: true, id: row.id, amountCents };
  } catch (err) {
    if (err instanceof AppError || err instanceof NotFoundError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    console.error("[registerStaffProductConsumption]", err);
    return { ok: false, error: "Não foi possível registrar o consumo" };
  }
}
