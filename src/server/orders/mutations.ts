import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { getOrderDetail } from "./queries";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const PAYMENT_METHODS = ["cash", "pix", "debit", "credit", "transfer", "other"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

async function recalculateOrderTotal(orderId: string, tenantId: string) {
  const db = createDb();
  const [agg] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
    })
    .from(schema.orderItems)
    .where(
      and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.tenantId, tenantId))
    );

  await db
    .update(schema.orders)
    .set({
      totalCents: Number(agg?.total ?? 0),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)));
}

async function assertOpenOrder(orderId: string, tenantId: string) {
  const db = createDb();
  const [order] = await db
    .select({
      id: schema.orders.id,
      status: schema.orders.status,
      totalCents: schema.orders.totalCents,
      discountCents: schema.orders.discountCents,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.tenantId, tenantId),
        isNull(schema.orders.deletedAt)
      )
    )
    .limit(1);

  if (!order) throw new AppError("NOT_FOUND", "Comanda não encontrada");
  if (order.status !== "open") {
    throw new AppError("VALIDATION", "Comanda não está aberta");
  }
  return order;
}

function calcCommission(
  totalCents: number,
  bps: number | null | undefined
): { commissionBps: number | null; commissionCents: number | null } {
  if (bps == null || bps < 0) return { commissionBps: null, commissionCents: null };
  return {
    commissionBps: bps,
    commissionCents: Math.round((totalCents * bps) / 10000),
  };
}

export async function openOrder(input: {
  clientId?: string;
  appointmentId?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    const db = createDb();

    let clientId = input.clientId || undefined;
    let appointmentId = input.appointmentId || undefined;

    if (clientId) {
      const [client] = await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(
          and(
            eq(schema.clients.id, clientId),
            eq(schema.clients.tenantId, tenant.id),
            isNull(schema.clients.deletedAt)
          )
        )
        .limit(1);
      if (!client) throw new AppError("VALIDATION", "Cliente inválido");
    }

    if (appointmentId) {
      const [appt] = await db
        .select({
          id: schema.appointments.id,
          orderId: schema.appointments.orderId,
          clientId: schema.appointments.clientId,
        })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.id, appointmentId),
            eq(schema.appointments.tenantId, tenant.id),
            isNull(schema.appointments.deletedAt)
          )
        )
        .limit(1);
      if (!appt) throw new AppError("VALIDATION", "Agendamento inválido");
      if (appt.orderId) {
        return { ok: true, id: appt.orderId };
      }
      if (!clientId && appt.clientId) {
        clientId = appt.clientId;
      }
    }

    const [row] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenant.id,
        clientId: clientId || null,
        appointmentId: appointmentId || null,
        status: "open",
        notes: input.notes?.trim() || null,
        openedByUserId: session.user.id,
      })
      .returning({ id: schema.orders.id });

    if (appointmentId) {
      await db
        .update(schema.appointments)
        .set({
          orderId: row.id,
          status: "in_progress",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.appointments.id, appointmentId),
            eq(schema.appointments.tenantId, tenant.id)
          )
        );
    }

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível abrir a comanda" };
  }
}

export async function addOrderItem(input: {
  orderId: string;
  itemType: "service" | "product";
  catalogId: string;
  staffId?: string;
  qty?: number;
  discountCents?: number;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    await assertOpenOrder(input.orderId, tenant.id);

    const qty = Math.max(1, Math.min(99, input.qty ?? 1));
    const discountCents = Math.max(0, input.discountCents ?? 0);
    const db = createDb();

    let description = "";
    let unitPriceCents = 0;
    let serviceId: string | null = null;
    let productId: string | null = null;
    let itemCommissionBps: number | null = null;

    if (input.itemType === "service") {
      const [svc] = await db
        .select({
          id: schema.services.id,
          name: schema.services.name,
          priceCents: schema.services.priceCents,
          commissionBps: schema.services.commissionBps,
        })
        .from(schema.services)
        .where(
          and(
            eq(schema.services.id, input.catalogId),
            eq(schema.services.tenantId, tenant.id),
            isNull(schema.services.deletedAt)
          )
        )
        .limit(1);
      if (!svc) throw new AppError("VALIDATION", "Serviço inválido");
      description = svc.name;
      unitPriceCents = svc.priceCents;
      serviceId = svc.id;
      itemCommissionBps = svc.commissionBps;
    } else {
      const [prod] = await db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          priceCents: schema.products.priceCents,
          commissionBps: schema.products.commissionBps,
          stockQty: schema.products.stockQty,
        })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.id, input.catalogId),
            eq(schema.products.tenantId, tenant.id),
            isNull(schema.products.deletedAt)
          )
        )
        .limit(1);
      if (!prod) throw new AppError("VALIDATION", "Produto inválido");
      if (prod.stockQty < qty) {
        throw new AppError("VALIDATION", `Estoque insuficiente (${prod.stockQty} un.)`);
      }
      description = prod.name;
      unitPriceCents = prod.priceCents;
      productId = prod.id;
      itemCommissionBps = prod.commissionBps;
    }

    let staffId: string | null = input.staffId || null;
    let staffCommissionBps: number | null = null;
    if (staffId) {
      const [st] = await db
        .select({
          id: schema.staff.id,
          defaultCommissionBps: schema.staff.defaultCommissionBps,
        })
        .from(schema.staff)
        .where(
          and(
            eq(schema.staff.id, staffId),
            eq(schema.staff.tenantId, tenant.id),
            isNull(schema.staff.deletedAt)
          )
        )
        .limit(1);
      if (!st) throw new AppError("VALIDATION", "Profissional inválido");
      staffCommissionBps = st.defaultCommissionBps;
    }

    const lineGross = unitPriceCents * qty;
    if (discountCents > lineGross) {
      throw new AppError("VALIDATION", "Desconto maior que o valor do item");
    }
    const totalCents = lineGross - discountCents;
    const bps = itemCommissionBps ?? staffCommissionBps;
    const commission = calcCommission(totalCents, bps);

    const [row] = await db
      .insert(schema.orderItems)
      .values({
        tenantId: tenant.id,
        orderId: input.orderId,
        itemType: input.itemType,
        serviceId,
        productId,
        staffId,
        description,
        qty,
        unitPriceCents,
        discountCents,
        totalCents,
        commissionBps: commission.commissionBps,
        commissionCents: commission.commissionCents,
        performedAt: new Date(),
      })
      .returning({ id: schema.orderItems.id });

    if (productId) {
      await db
        .update(schema.products)
        .set({
          stockQty: sql`${schema.products.stockQty} - ${qty}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenant.id))
        );
    }

    await recalculateOrderTotal(input.orderId, tenant.id);
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível adicionar o item" };
  }
}

export async function removeOrderItem(itemId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    const db = createDb();

    const [item] = await db
      .select({
        id: schema.orderItems.id,
        orderId: schema.orderItems.orderId,
      })
      .from(schema.orderItems)
      .where(
        and(eq(schema.orderItems.id, itemId), eq(schema.orderItems.tenantId, tenant.id))
      )
      .limit(1);

    if (!item) throw new AppError("NOT_FOUND", "Item não encontrado");
    await assertOpenOrder(item.orderId, tenant.id);

    await db
      .delete(schema.orderItems)
      .where(
        and(eq(schema.orderItems.id, itemId), eq(schema.orderItems.tenantId, tenant.id))
      );

    await recalculateOrderTotal(item.orderId, tenant.id);
    return { ok: true, id: item.orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível remover o item" };
  }
}

export async function addPayment(input: {
  orderId: string;
  method: string;
  amountCents: number;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    await assertOpenOrder(input.orderId, tenant.id);

    if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) {
      throw new AppError("VALIDATION", "Forma de pagamento inválida");
    }
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
      throw new AppError("VALIDATION", "Valor do pagamento inválido");
    }

    const detail = await getOrderDetail(input.orderId);
    if (input.amountCents > detail.balanceCents + 1) {
      const resto = (detail.balanceCents / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      throw new AppError("VALIDATION", `Valor excede o saldo (restante ${resto})`);
    }

    const db = createDb();
    const [row] = await db
      .insert(schema.payments)
      .values({
        tenantId: tenant.id,
        orderId: input.orderId,
        method: input.method as PaymentMethod,
        amountCents: Math.round(input.amountCents),
      })
      .returning({ id: schema.payments.id });

    const { recordPaymentInCash } = await import("../finance/mutations");
    await recordPaymentInCash({
      tenantId: tenant.id,
      orderId: input.orderId,
      method: input.method as PaymentMethod,
      amountCents: Math.round(input.amountCents),
    });

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível registrar o pagamento" };
  }
}

export async function setOrderDiscount(
  orderId: string,
  discountCents: number
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    const order = await assertOpenOrder(orderId, tenant.id);

    const d = Math.max(0, Math.round(discountCents));
    if (d > order.totalCents) {
      throw new AppError("VALIDATION", "Desconto maior que o total da comanda");
    }

    const db = createDb();
    await db
      .update(schema.orders)
      .set({ discountCents: d, updatedAt: new Date() })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível aplicar o desconto" };
  }
}

export async function closeOrder(orderId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    await assertOpenOrder(orderId, tenant.id);

    const detail = await getOrderDetail(orderId);
    if (detail.items.length === 0) {
      throw new AppError("VALIDATION", "Adicione ao menos um item antes de fechar");
    }
    if (detail.balanceCents > 0) {
      const resto = (detail.balanceCents / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      throw new AppError("VALIDATION", `Ainda falta pagar ${resto}`);
    }

    const db = createDb();
    await db
      .update(schema.orders)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedByUserId: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));

    if (detail.appointmentId) {
      await db
        .update(schema.appointments)
        .set({ status: "completed", updatedAt: new Date() })
        .where(
          and(
            eq(schema.appointments.id, detail.appointmentId),
            eq(schema.appointments.tenantId, tenant.id)
          )
        );
    }

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível fechar a comanda" };
  }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    await assertOpenOrder(orderId, tenant.id);

    const detail = await getOrderDetail(orderId);
    if (detail.paidCents > 0) {
      throw new AppError(
        "VALIDATION",
        "Comanda com pagamentos não pode ser cancelada. Remova os pagamentos ou feche."
      );
    }

    const db = createDb();
    await db
      .update(schema.orders)
      .set({
        status: "cancelled",
        closedAt: new Date(),
        closedByUserId: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível cancelar a comanda" };
  }
}
