import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { formatMoney } from "@/lib/format";

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

export async function openOrderForAgent(input: {
  tenantId: string;
  clientId?: string;
  appointmentId?: string;
  notes?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
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
          eq(schema.clients.tenantId, input.tenantId),
          isNull(schema.clients.deletedAt)
        )
      )
      .limit(1);
    if (!client) return { ok: false, error: "Cliente inválido" };
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
          eq(schema.appointments.tenantId, input.tenantId),
          isNull(schema.appointments.deletedAt)
        )
      )
      .limit(1);
    if (!appt) return { ok: false, error: "Agendamento inválido" };
    if (appt.orderId) return { ok: true, id: appt.orderId };
    if (!clientId && appt.clientId) clientId = appt.clientId;
  }

  if (clientId) {
    const [existing] = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.tenantId, input.tenantId),
          eq(schema.orders.clientId, clientId),
          eq(schema.orders.status, "open"),
          isNull(schema.orders.deletedAt)
        )
      )
      .orderBy(desc(schema.orders.openedAt))
      .limit(1);
    if (existing) return { ok: true, id: existing.id };
  }

  const [row] = await db
    .insert(schema.orders)
    .values({
      tenantId: input.tenantId,
      clientId: clientId || null,
      appointmentId: appointmentId || null,
      status: "open",
      notes: input.notes?.trim() || null,
    })
    .returning({ id: schema.orders.id });

  if (appointmentId) {
    await db
      .update(schema.appointments)
      .set({ orderId: row.id, status: "in_progress", updatedAt: new Date() })
      .where(
        and(
          eq(schema.appointments.id, appointmentId),
          eq(schema.appointments.tenantId, input.tenantId)
        )
      );
  }

  return { ok: true, id: row.id };
}

export async function addOrderItemForAgent(input: {
  tenantId: string;
  orderId: string;
  itemType: "service" | "product";
  catalogId: string;
  staffId?: string;
  qty?: number;
}): Promise<{ ok: true; id: string; totalCents: number } | { ok: false; error: string }> {
  const db = createDb();
  const [order] = await db
    .select({ id: schema.orders.id, status: schema.orders.status })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, input.orderId),
        eq(schema.orders.tenantId, input.tenantId),
        isNull(schema.orders.deletedAt)
      )
    )
    .limit(1);
  if (!order) return { ok: false, error: "Comanda não encontrada" };
  if (order.status !== "open") return { ok: false, error: "Comanda não está aberta" };

  const qty = Math.max(1, Math.min(99, input.qty ?? 1));
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
          eq(schema.services.tenantId, input.tenantId),
          isNull(schema.services.deletedAt)
        )
      )
      .limit(1);
    if (!svc) return { ok: false, error: "Serviço inválido" };
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
          eq(schema.products.tenantId, input.tenantId),
          isNull(schema.products.deletedAt)
        )
      )
      .limit(1);
    if (!prod) return { ok: false, error: "Produto inválido" };
    if (prod.stockQty < qty) {
      return { ok: false, error: `Estoque insuficiente (${prod.stockQty} un.)` };
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
          eq(schema.staff.tenantId, input.tenantId),
          isNull(schema.staff.deletedAt)
        )
      )
      .limit(1);
    if (!st) return { ok: false, error: "Profissional inválido" };
    staffCommissionBps = st.defaultCommissionBps;
  }

  const totalCents = unitPriceCents * qty;
  const commission = calcCommission(totalCents, itemCommissionBps ?? staffCommissionBps);

  const [row] = await db
    .insert(schema.orderItems)
    .values({
      tenantId: input.tenantId,
      orderId: input.orderId,
      itemType: input.itemType,
      serviceId,
      productId,
      staffId,
      description,
      qty,
      unitPriceCents,
      discountCents: 0,
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
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, input.tenantId)));
  }

  const [agg] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
    })
    .from(schema.orderItems)
    .where(
      and(eq(schema.orderItems.orderId, input.orderId), eq(schema.orderItems.tenantId, input.tenantId))
    );

  const orderTotal = Number(agg?.total ?? 0);
  await db
    .update(schema.orders)
    .set({ totalCents: orderTotal, updatedAt: new Date() })
    .where(and(eq(schema.orders.id, input.orderId), eq(schema.orders.tenantId, input.tenantId)));

  return { ok: true, id: row.id, totalCents: orderTotal };
}

export async function listOpenOrdersForAgent(input: {
  tenantId: string;
  phoneE164?: string;
  clientId?: string;
  limit?: number;
}): Promise<{
  ok: true;
  count: number;
  totalOpenCents: number;
  totalOpenLabel: string;
  orders: Array<{
    id: string;
    clientName: string | null;
    phoneE164: string | null;
    totalCents: number;
    totalLabel: string;
    itemsCount: number;
    openedAt: string | null;
  }>;
}> {
  const db = createDb();
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));

  let clientId = input.clientId;
  if (!clientId && input.phoneE164) {
    const digits = input.phoneE164.replace(/\D/g, "");
    const last11 = digits.slice(-11);
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.tenantId, input.tenantId),
          isNull(schema.clients.deletedAt),
          sql`right(regexp_replace(coalesce(${schema.clients.phoneE164}, ''), '\\D', '', 'g'), 11) = ${last11}`
        )
      )
      .limit(1);
    clientId = client?.id;
  }

  const where = and(
    eq(schema.orders.tenantId, input.tenantId),
    eq(schema.orders.status, "open"),
    isNull(schema.orders.deletedAt),
    clientId ? eq(schema.orders.clientId, clientId) : undefined
  );

  const rows = await db
    .select({
      id: schema.orders.id,
      totalCents: schema.orders.totalCents,
      openedAt: schema.orders.openedAt,
      clientName: schema.clients.name,
      phoneE164: schema.clients.phoneE164,
      itemsCount: sql<number>`(
        select count(*)::int from ${schema.orderItems}
        where ${schema.orderItems.orderId} = ${schema.orders.id}
      )`.as("items_count"),
    })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where)
    .orderBy(desc(schema.orders.openedAt))
    .limit(limit);

  const orders = rows.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    phoneE164: r.phoneE164,
    totalCents: Number(r.totalCents ?? 0),
    totalLabel: formatMoney(Number(r.totalCents ?? 0)),
    itemsCount: Number(r.itemsCount ?? 0),
    openedAt: r.openedAt ? r.openedAt.toISOString() : null,
  }));

  const totalOpenCents = orders.reduce((s, o) => s + o.totalCents, 0);

  return {
    ok: true,
    count: orders.length,
    totalOpenCents,
    totalOpenLabel: formatMoney(totalOpenCents),
    orders,
  };
}
