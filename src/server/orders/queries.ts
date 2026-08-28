import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { PAGE_SIZE } from "@/lib/cadastros";
import { rangeBoundsSp, todaySp } from "@/lib/datetime";
import { ForbiddenError, NotFoundError } from "../errors";
import { resolveBranchScope, withBranchScope } from "../context/branch-scope";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { isBarberRole } from "../permissions/roles";
import { resolveSessionStaffId } from "../permissions/staff-scope";
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

/** Comanda vinculada ao profissional (item ou agendamento). */
function orderBelongsToStaffCondition(staffId: string) {
  return or(
    sql`exists (
      select 1 from ${schema.orderItems}
      where ${schema.orderItems.orderId} = ${schema.orders.id}
        and ${schema.orderItems.staffId} = ${staffId}
    )`,
    sql`exists (
      select 1 from ${schema.appointments}
      where ${schema.appointments.id} = ${schema.orders.appointmentId}
        and ${schema.appointments.staffId} = ${staffId}
    )`
  );
}

async function resolveBarberStaffFilter(): Promise<string | null | undefined> {
  const session = await requireSession();
  if (!isBarberRole(session.role)) return undefined;
  return resolveSessionStaffId(session);
}

async function assertOwnOrderAccess(orderId: string): Promise<void> {
  const staffFilter = await resolveBarberStaffFilter();
  if (staffFilter === undefined) return;
  if (!staffFilter) {
    throw new ForbiddenError(
      "Conta não vinculada a um profissional. Peça ao dono para vincular em Configurações → Equipe."
    );
  }

  const tenant = await requireTenantContext();
  const db = createDb();
  const [row] = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.tenantId, tenant.id),
        isNull(schema.orders.deletedAt),
        orderBelongsToStaffCondition(staffFilter)
      )
    )
    .limit(1);

  if (!row) {
    throw new ForbiddenError("Acesso restrito às suas comandas");
  }
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
  const scope = await resolveBranchScope();
  const staffFilter = await resolveBarberStaffFilter();
  const db = createDb();
  const q = opts?.q?.trim();

  if (scope.isInactiveBranch || staffFilter === null) {
    return { rows: [], total: 0, totalCents: 0, q: q ?? "" };
  }

  let where = withBranchScope(
    scope,
    schema.orders.branchId,
    and(
      eq(schema.orders.tenantId, tenant.id),
      eq(schema.orders.status, "open"),
      isNull(schema.orders.deletedAt)
    )
  );

  if (typeof staffFilter === "string") {
    where = and(where, orderBelongsToStaffCondition(staffFilter));
  }

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
    .where(where);

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

export async function listOrderHistory(opts: {
  from?: string;
  to?: string;
  status?: OrderStatus | "all";
  q?: string;
  page?: number;
}): Promise<{
  rows: OrderListItem[];
  total: number;
  totalCents: number;
  page: number;
  pageSize: number;
  totalPages: number;
  from: string;
  to: string;
  status: OrderStatus | "all";
  q: string;
}> {
  const tenant = await requireTenantContext();
  const scope = await resolveBranchScope();
  const staffFilter = await resolveBarberStaffFilter();
  const db = createDb();
  const from = opts.from ?? shiftDaysSp(todaySp(), -30);
  const to = opts.to ?? todaySp();
  const { start, end } = rangeBoundsSp(from, to);
  const status = opts.status ?? "all";
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();

  if (scope.isInactiveBranch || staffFilter === null) {
    return {
      rows: [],
      total: 0,
      totalCents: 0,
      page,
      pageSize: PAGE_SIZE,
      totalPages: 1,
      from,
      to,
      status,
      q: q ?? "",
    };
  }

  let where = withBranchScope(
    scope,
    schema.orders.branchId,
    and(
      eq(schema.orders.tenantId, tenant.id),
      gte(schema.orders.openedAt, start),
      lte(schema.orders.openedAt, end),
      isNull(schema.orders.deletedAt)
    )
  );

  if (typeof staffFilter === "string") {
    where = and(where, orderBelongsToStaffCondition(staffFilter));
  }

  if (status !== "all") {
    where = and(where, eq(schema.orders.status, status));
  }

  if (q) {
    where = and(
      where,
      or(
        ilike(schema.clients.name, `%${q}%`),
        ilike(schema.orders.externalId, `%${q}%`)
      )
    );
  }

  const [totalRow] = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
    })
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where);

  const rows = await db
    .select(orderListSelect())
    .from(schema.orders)
    .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .where(where)
    .orderBy(desc(schema.orders.openedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const total = Number(totalRow?.n ?? 0);

  return {
    rows: rows.map((r) => ({
      ...r,
      status: r.status as OrderStatus,
      itemCount: Number(r.itemCount ?? 0),
      paidCents: Number(r.paidCents ?? 0),
    })),
    total,
    totalCents: Number(totalRow?.total ?? 0),
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    from,
    to,
    status,
    q: q ?? "",
  };
}

function shiftDaysSp(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00-03:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  await assertOwnOrderAccess(orderId);

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
