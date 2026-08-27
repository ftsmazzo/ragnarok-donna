import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { NotFoundError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import type {
  CatalogProduct,
  CatalogService,
  CatalogStaff,
  OrderDetail,
  OrderListItem,
  OrderPermissions,
  OrderStatus,
} from "./types";

export async function getOrderPermissions(): Promise<OrderPermissions> {
  const session = await requireSession();
  return {
    canWrite: hasCapability(session.role, "orders.write"),
    canCancel: hasCapability(session.role, "orders.write"),
  };
}

function orderListSelect() {
  return {
    id: schema.orders.id,
    externalId: schema.orders.externalId,
    clientId: schema.orders.clientId,
    clientName: schema.clients.name,
    openedAt: schema.orders.openedAt,
    closedAt: schema.orders.closedAt,
    totalCents: schema.orders.totalCents,
    discountCents: schema.orders.discountCents,
    status: schema.orders.status,
    itemCount: sql<number>`(
      select count(*)::int from ${schema.orderItems}
      where ${schema.orderItems.orderId} = ${schema.orders.id}
    )`.as("item_count"),
    paidCents: sql<number>`(
      select coalesce(sum(${schema.payments.amountCents}), 0)::int from ${schema.payments}
      where ${schema.payments.orderId} = ${schema.orders.id}
    )`.as("paid_cents"),
    staffLabel: sql<string | null>`(
      select ${schema.staff.name} from ${schema.orderItems}
      left join ${schema.staff} on ${schema.staff.id} = ${schema.orderItems.staffId}
      where ${schema.orderItems.orderId} = ${schema.orders.id}
      order by ${schema.orderItems.createdAt} asc
      limit 1
    )`.as("staff_label"),
  };
}

export async function listOpenOrders(opts?: { q?: string }): Promise<{
  rows: OrderListItem[];
  total: number;
  totalCents: number;
  q: string;
}> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const q = opts?.q?.trim();

  let where = and(
    eq(schema.orders.tenantId, tenant.id),
    eq(schema.orders.status, "open"),
    isNull(schema.orders.deletedAt)
  );

  if (q) {
    where = and(
      where,
      or(
        ilike(schema.clients.name, `%${q}%`),
        ilike(schema.orders.externalId, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select(orderListSelect())
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where)
    .orderBy(desc(schema.orders.openedAt));

  const [totalRow] = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt)
      )
    );

  return {
    rows: rows.map((r) => ({
      ...r,
      status: r.status as OrderStatus,
      itemCount: Number(r.itemCount ?? 0),
      paidCents: Number(r.paidCents ?? 0),
    })),
    total: Number(totalRow?.n ?? 0),
    totalCents: Number(totalRow?.total ?? 0),
    q: q ?? "",
  };
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [order] = await db
    .select({
      id: schema.orders.id,
      externalId: schema.orders.externalId,
      status: schema.orders.status,
      clientId: schema.orders.clientId,
      clientName: schema.clients.name,
      appointmentId: schema.orders.appointmentId,
      openedAt: schema.orders.openedAt,
      closedAt: schema.orders.closedAt,
      totalCents: schema.orders.totalCents,
      discountCents: schema.orders.discountCents,
      notes: schema.orders.notes,
    })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.tenantId, tenant.id),
        isNull(schema.orders.deletedAt)
      )
    )
    .limit(1);

  if (!order) throw new NotFoundError("Comanda não encontrada");

  const items = await db
    .select({
      id: schema.orderItems.id,
      itemType: schema.orderItems.itemType,
      description: schema.orderItems.description,
      qty: schema.orderItems.qty,
      unitPriceCents: schema.orderItems.unitPriceCents,
      discountCents: schema.orderItems.discountCents,
      totalCents: schema.orderItems.totalCents,
      staffId: schema.orderItems.staffId,
      staffName: schema.staff.name,
      commissionBps: schema.orderItems.commissionBps,
      commissionCents: schema.orderItems.commissionCents,
      serviceId: schema.orderItems.serviceId,
      productId: schema.orderItems.productId,
      performedAt: schema.orderItems.performedAt,
    })
    .from(schema.orderItems)
    .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
    .where(
      and(
        eq(schema.orderItems.orderId, orderId),
        eq(schema.orderItems.tenantId, tenant.id)
      )
    )
    .orderBy(asc(schema.orderItems.createdAt));

  const payments = await db
    .select({
      id: schema.payments.id,
      method: schema.payments.method,
      amountCents: schema.payments.amountCents,
      paidAt: schema.payments.paidAt,
    })
    .from(schema.payments)
    .where(
      and(eq(schema.payments.orderId, orderId), eq(schema.payments.tenantId, tenant.id))
    )
    .orderBy(asc(schema.payments.paidAt));

  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const due = Math.max(0, order.totalCents - order.discountCents);

  return {
    id: order.id,
    externalId: order.externalId,
    status: order.status as OrderStatus,
    clientId: order.clientId,
    clientName: order.clientName,
    appointmentId: order.appointmentId,
    openedAt: order.openedAt,
    closedAt: order.closedAt,
    totalCents: order.totalCents,
    discountCents: order.discountCents,
    notes: order.notes,
    items,
    payments,
    paidCents,
    balanceCents: due - paidCents,
  };
}

export async function listCatalogForOrders(): Promise<{
  services: CatalogService[];
  products: CatalogProduct[];
  staff: CatalogStaff[];
}> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [services, products, staff] = await Promise.all([
    db
      .select({
        id: schema.services.id,
        name: schema.services.name,
        priceCents: schema.services.priceCents,
        commissionBps: schema.services.commissionBps,
      })
      .from(schema.services)
      .where(
        and(
          eq(schema.services.tenantId, tenant.id),
          eq(schema.services.isActive, true),
          isNull(schema.services.deletedAt)
        )
      )
      .orderBy(asc(schema.services.name)),
    db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        priceCents: schema.products.priceCents,
        commissionBps: schema.products.commissionBps,
      })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, tenant.id),
          eq(schema.products.isActive, true),
          eq(schema.products.forSale, true),
          isNull(schema.products.deletedAt)
        )
      )
      .orderBy(asc(schema.products.name)),
    db
      .select({
        id: schema.staff.id,
        name: schema.staff.name,
        defaultCommissionBps: schema.staff.defaultCommissionBps,
      })
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

  return { services, products, staff };
}
