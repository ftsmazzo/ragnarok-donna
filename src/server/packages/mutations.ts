import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { topUpClientPackageCredits } from "./credits";

export type RenewResult =
  | { ok: true; id: string; orderId?: string; refundedCents?: number }
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

export async function sellCatalogPackageToClient(input: {
  clientId: string;
  packageId: string;
  staffId?: string;
}): Promise<RenewResult> {
  return completePackageSale({
    ...input,
    payAndClose: false,
  });
}

export async function completePackageSale(input: {
  clientId: string;
  packageId: string;
  staffId?: string;
  notes?: string;
  method?: string;
  payAndClose?: boolean;
  amountCents?: number;
}): Promise<RenewResult> {
  try {
    const { requireTenantContext, requireSession } = await import("../context/tenant");
    const { requireCapability } = await import("../permissions/guards");
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    const db = createDb();

    const clientId = input.clientId.trim();
    const packageId = input.packageId.trim();
    if (!clientId || !packageId) {
      return { ok: false, error: "Cliente e pacote são obrigatórios" };
    }

    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.id, clientId),
          eq(schema.clients.tenantId, tenant.id),
          eq(schema.clients.isActive, true),
          isNull(schema.clients.deletedAt)
        )
      )
      .limit(1);
    if (!client) return { ok: false, error: "Cliente não encontrado ou inativo" };

    let orderId = "";
    const [open] = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.tenantId, tenant.id),
          eq(schema.orders.clientId, clientId),
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
      const opened = await openOrder({ clientId });
      if (!opened.ok) return opened;
      orderId = opened.id;
    }

    const { addOrderItem, addPayment, closeOrder } = await import("../orders/mutations");
    const sold = await addOrderItem({
      orderId,
      itemType: "package",
      catalogId: packageId,
      staffId: input.staffId?.trim() || undefined,
      qty: 1,
      saleNotes: input.notes,
    });
    if (!sold.ok) return sold;

    if (input.payAndClose) {
      const method = input.method?.trim();
      if (!method) {
        return { ok: false, error: "Selecione a forma de pagamento" };
      }
      const amountCents =
        input.amountCents != null && Number.isFinite(input.amountCents)
          ? Math.round(input.amountCents)
          : undefined;
      if (amountCents == null || amountCents <= 0) {
        return { ok: false, error: "Informe o valor pago" };
      }
      const pay = await addPayment({ orderId, method, amountCents });
      if (!pay.ok) return pay;
      const closed = await closeOrder(orderId);
      if (!closed.ok) return closed;
    }

    return { ok: true, id: sold.id, orderId };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível vender o pacote" };
  }
}

/**
 * Cancela venda de pacote ainda sem uso.
 * Vale com a comanda já fechada: tira a carteira, o item e o pagamento do dia (Caixa).
 */
export async function cancelUnusedPackageSale(input: {
  clientPackageId?: string;
  orderItemId?: string;
  paymentId?: string;
}): Promise<RenewResult> {
  try {
    const { requireTenantContext, requireSession } = await import("../context/tenant");
    const { requireCapability } = await import("../permissions/guards");
    const { isBarberRole } = await import("../permissions/roles");
    const session = await requireSession();
    requireCapability(session, "orders.write");
    if (isBarberRole(session.role)) {
      throw new ForbiddenError("Barbeiro não cancela venda de pacote");
    }
    const tenant = await requireTenantContext();
    const db = createDb();
    let clientPackageId = input.clientPackageId?.trim() || "";
    let orderItemId = input.orderItemId?.trim() || "";
    const paymentId = input.paymentId?.trim() || "";

    if (!clientPackageId && !orderItemId && !paymentId) {
      return { ok: false, error: "Pacote não informado" };
    }

    const outcome = await db.transaction(async (tx) => {
      if (paymentId && !clientPackageId && !orderItemId) {
        const [pay] = await tx
          .select({ orderId: schema.payments.orderId })
          .from(schema.payments)
          .where(
            and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, tenant.id))
          )
          .limit(1);
        if (!pay) throw new AppError("NOT_FOUND", "Pagamento não encontrado");

        const [linked] = await tx
          .select({
            id: schema.clientPackages.id,
            orderItemId: schema.clientPackages.orderItemId,
          })
          .from(schema.clientPackages)
          .where(
            and(
              eq(schema.clientPackages.tenantId, tenant.id),
              eq(schema.clientPackages.orderId, pay.orderId),
              ne(schema.clientPackages.status, "cancelled")
            )
          )
          .orderBy(desc(schema.clientPackages.purchasedAt))
          .limit(1);
        if (linked) {
          clientPackageId = linked.id;
          if (linked.orderItemId) orderItemId = linked.orderItemId;
        } else {
          const [pkgItem] = await tx
            .select({
              id: schema.orderItems.id,
              meta: schema.orderItems.meta,
            })
            .from(schema.orderItems)
            .where(
              and(
                eq(schema.orderItems.tenantId, tenant.id),
                eq(schema.orderItems.orderId, pay.orderId),
                eq(schema.orderItems.itemType, "package")
              )
            )
            .limit(1);
          if (!pkgItem) {
            throw new AppError(
              "VALIDATION",
              "Esse pagamento não é de uma venda de pacote cancelável"
            );
          }
          orderItemId = pkgItem.id;
          const meta = (pkgItem.meta ?? {}) as Record<string, unknown>;
          if (typeof meta.clientPackageId === "string") {
            clientPackageId = meta.clientPackageId;
          }
        }
      }

      let pkgId = clientPackageId;
      if (!pkgId && orderItemId) {
        const [item] = await tx
          .select({ meta: schema.orderItems.meta })
          .from(schema.orderItems)
          .where(
            and(
              eq(schema.orderItems.id, orderItemId),
              eq(schema.orderItems.tenantId, tenant.id)
            )
          )
          .limit(1);
        const meta = (item?.meta ?? {}) as Record<string, unknown>;
        if (typeof meta.clientPackageId === "string") pkgId = meta.clientPackageId;
      }

      let pkg:
        | {
            id: string;
            clientId: string;
            orderId: string | null;
            orderItemId: string | null;
            status: string;
          }
        | undefined;
      if (pkgId) {
        const [row] = await tx
          .select({
            id: schema.clientPackages.id,
            clientId: schema.clientPackages.clientId,
            orderId: schema.clientPackages.orderId,
            orderItemId: schema.clientPackages.orderItemId,
            status: schema.clientPackages.status,
          })
          .from(schema.clientPackages)
          .where(
            and(
              eq(schema.clientPackages.id, pkgId),
              eq(schema.clientPackages.tenantId, tenant.id)
            )
          )
          .for("update")
          .limit(1);
        pkg = row;
      }

      if (pkg && pkg.status === "cancelled") {
        throw new AppError("VALIDATION", "Essa venda de pacote já foi cancelada");
      }

      if (pkg) {
        const credits = await tx
          .select({
            remainingQty: schema.clientPackageCredits.remainingQty,
            totalQty: schema.clientPackageCredits.totalQty,
          })
          .from(schema.clientPackageCredits)
          .where(
            and(
              eq(schema.clientPackageCredits.clientPackageId, pkg.id),
              eq(schema.clientPackageCredits.tenantId, tenant.id)
            )
          );
        if (credits.some((c) => c.remainingQty < c.totalQty)) {
          throw new AppError(
            "VALIDATION",
            "Não dá para cancelar: já houve uso de crédito deste pacote"
          );
        }
      }

      const saleSelect = {
        id: schema.orderItems.id,
        orderId: schema.orderItems.orderId,
        totalCents: schema.orderItems.totalCents,
      };
      let saleItem:
        | { id: string; orderId: string; totalCents: number }
        | undefined;

      const preferredItemId = pkg?.orderItemId || orderItemId;
      if (preferredItemId) {
        const [row] = await tx
          .select(saleSelect)
          .from(schema.orderItems)
          .where(
            and(
              eq(schema.orderItems.id, preferredItemId),
              eq(schema.orderItems.tenantId, tenant.id)
            )
          )
          .limit(1);
        saleItem = row;
      }
      if (!saleItem && pkg) {
        const [byMeta] = await tx
          .select(saleSelect)
          .from(schema.orderItems)
          .where(
            and(
              eq(schema.orderItems.tenantId, tenant.id),
              sql`${schema.orderItems.meta}->>'clientPackageId' = ${pkg.id}`
            )
          )
          .limit(1);
        saleItem = byMeta;
      }
      if (!saleItem && pkg?.orderId) {
        const [byOrder] = await tx
          .select(saleSelect)
          .from(schema.orderItems)
          .where(
            and(
              eq(schema.orderItems.tenantId, tenant.id),
              eq(schema.orderItems.orderId, pkg.orderId),
              eq(schema.orderItems.itemType, "package")
            )
          )
          .limit(1);
        saleItem = byOrder;
      }

      if (pkg) {
        await tx
          .delete(schema.clientPackageCredits)
          .where(
            and(
              eq(schema.clientPackageCredits.clientPackageId, pkg.id),
              eq(schema.clientPackageCredits.tenantId, tenant.id)
            )
          );
        await tx
          .update(schema.clientPackages)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(schema.clientPackages.id, pkg.id),
              eq(schema.clientPackages.tenantId, tenant.id)
            )
          );
      }

      if (!saleItem) {
        if (!pkg) throw new AppError("NOT_FOUND", "Venda de pacote não encontrada");
        throw new AppError(
          "VALIDATION",
          "Carteira cancelada, mas a comanda da venda não foi encontrada para estornar o caixa. Abra o suporte com o nome do cliente."
        );
      }

      const [order] = await tx
        .select({
          id: schema.orders.id,
          status: schema.orders.status,
          discountCents: schema.orders.discountCents,
          clientId: schema.orders.clientId,
        })
        .from(schema.orders)
        .where(
          and(eq(schema.orders.id, saleItem.orderId), eq(schema.orders.tenantId, tenant.id))
        )
        .for("update")
        .limit(1);
      if (!order) throw new AppError("NOT_FOUND", "Comanda não encontrada");

      await tx
        .delete(schema.orderItems)
        .where(
          and(eq(schema.orderItems.id, saleItem.id), eq(schema.orderItems.tenantId, tenant.id))
        );

      const [agg] = await tx
        .select({
          total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.orderId, order.id),
            eq(schema.orderItems.tenantId, tenant.id)
          )
        );
      const nextTotal = Number(agg?.total ?? 0);
      const remainingItems = Number(agg?.count ?? 0);
      const nextDiscount = Math.min(order.discountCents, nextTotal);
      const due = Math.max(0, nextTotal - nextDiscount);

      const [paidRow] = await tx
        .select({
          paid: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
        })
        .from(schema.payments)
        .where(
          and(eq(schema.payments.orderId, order.id), eq(schema.payments.tenantId, tenant.id))
        );
      let excess = Number(paidRow?.paid ?? 0) - due;
      if (excess > 0 && order.status === "open") {
        throw new AppError(
          "VALIDATION",
          "Não é possível cancelar: o total ficaria abaixo do já pago. Ajuste o pagamento antes."
        );
      }

      let refundedCents = 0;
      if (excess > 0) {
        const pays = await tx
          .select({
            id: schema.payments.id,
            method: schema.payments.method,
            amountCents: schema.payments.amountCents,
          })
          .from(schema.payments)
          .where(
            and(eq(schema.payments.orderId, order.id), eq(schema.payments.tenantId, tenant.id))
          )
          .orderBy(desc(schema.payments.paidAt));

        const [cash] = await tx
          .select({ id: schema.cashSessions.id })
          .from(schema.cashSessions)
          .where(
            and(
              eq(schema.cashSessions.tenantId, tenant.id),
              isNull(schema.cashSessions.closedAt)
            )
          )
          .orderBy(desc(schema.cashSessions.openedAt))
          .limit(1);

        const { applyClientAccountDeltaTx } = await import("../clients/account");
        for (const pay of pays) {
          if (excess <= 0) break;
          const take = Math.min(pay.amountCents, excess);
          if (pay.method === "client_account" && order.clientId) {
            await applyClientAccountDeltaTx(tx, {
              tenantId: tenant.id,
              clientId: order.clientId,
              deltaCents: take,
              reason: "order_reversal",
              notes: "Estorno ao cancelar venda de pacote",
              orderId: order.id,
              createdByUserId: session.user.id,
            });
          } else if (pay.method !== "client_account" && cash) {
            await tx.insert(schema.cashMovements).values({
              tenantId: tenant.id,
              cashSessionId: cash.id,
              orderId: order.id,
              direction: "out",
              method: pay.method,
              amountCents: take,
              description: "Estorno venda de pacote",
            });
          }
          // Sempre remove o pagamento do dia (Caixa → Detalhe), mesmo sem sessão aberta.
          if (take === pay.amountCents) {
            await tx
              .delete(schema.payments)
              .where(
                and(eq(schema.payments.id, pay.id), eq(schema.payments.tenantId, tenant.id))
              );
          } else {
            await tx
              .update(schema.payments)
              .set({ amountCents: pay.amountCents - take, updatedAt: new Date() })
              .where(
                and(eq(schema.payments.id, pay.id), eq(schema.payments.tenantId, tenant.id))
              );
          }
          refundedCents += take;
          excess -= take;
        }
      }

      await tx
        .update(schema.orders)
        .set({
          totalCents: nextTotal,
          discountCents: nextDiscount,
          status: remainingItems === 0 ? "cancelled" : order.status,
          ...(remainingItems === 0 ? { closedAt: null } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.orders.id, order.id), eq(schema.orders.tenantId, tenant.id)));

      return {
        id: pkg?.id ?? saleItem.id,
        orderId: order.id,
        refundedCents,
      };
    });

    return {
      ok: true,
      id: outcome.id,
      orderId: outcome.orderId,
      refundedCents: outcome.refundedCents,
    };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível cancelar a venda do pacote" };
  }
}
