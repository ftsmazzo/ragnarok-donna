import { and, desc, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { topUpClientPackageCredits } from "./credits";

export type RenewResult =
  | { ok: true; id: string; orderId?: string }
  | { ok: false; error: string };

/**
 * Repor: soma créditos no pacote existente (sem cobrança).
 * Renovar: vende o template de novo na comanda (cria carteira + linha financeira).
 */
export async function renewOrTopUpClientPackage(input: {
  clientPackageId: string;
  mode: "topup" | "renew";
  orderId?: string;
}): Promise<RenewResult> {
  try {
    if (input.mode === "topup") {
      return topUpClientPackageCredits(input.clientPackageId);
    }

    const { requireTenantContext, requireSession } = await import("../context/tenant");
    const { requireCapability } = await import("../permissions/guards");
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    const db = createDb();

    const [pkg] = await db
      .select({
        id: schema.clientPackages.id,
        clientId: schema.clientPackages.clientId,
        packageId: schema.clientPackages.packageId,
      })
      .from(schema.clientPackages)
      .where(
        and(
          eq(schema.clientPackages.id, input.clientPackageId),
          eq(schema.clientPackages.tenantId, tenant.id)
        )
      )
      .limit(1);

    if (!pkg) return { ok: false, error: "Pacote do cliente não encontrado" };
    if (!pkg.packageId) {
      return {
        ok: false,
        error: "Este pacote não tem template no catálogo para renovar a venda",
      };
    }

    let orderId = input.orderId?.trim() || "";
    if (orderId) {
      const [order] = await db
        .select({
          id: schema.orders.id,
          clientId: schema.orders.clientId,
          status: schema.orders.status,
        })
        .from(schema.orders)
        .where(
          and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id))
        )
        .limit(1);
      if (!order || order.status !== "open") {
        return { ok: false, error: "Comanda inválida ou já fechada" };
      }
      if (order.clientId !== pkg.clientId) {
        return { ok: false, error: "Comanda de outro cliente" };
      }
    } else {
      const [open] = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.tenantId, tenant.id),
            eq(schema.orders.clientId, pkg.clientId),
            eq(schema.orders.status, "open"),
            isNull(schema.orders.deletedAt)
          )
        )
        .orderBy(desc(schema.orders.openedAt))
        .limit(1);

      if (open) {
        orderId = open.id;
      } else {
        const { openOrder } = await import("../orders/mutations");
        const opened = await openOrder({ clientId: pkg.clientId });
        if (!opened.ok) return opened;
        orderId = opened.id;
      }
    }

    const { addOrderItem } = await import("../orders/mutations");
    const sold = await addOrderItem({
      orderId,
      itemType: "package",
      catalogId: pkg.packageId,
      qty: 1,
    });
    if (!sold.ok) return sold;
    return { ok: true, id: sold.id, orderId };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível renovar o pacote" };
  }
}
