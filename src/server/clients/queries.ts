import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { createDb, schema } from "@/db";
import { NotFoundError } from "../errors";
import { resolveBranchScope } from "../context/branch-scope";
import { requireTenantContext } from "../context/tenant";
import {
  andWhere,
  appointmentsForClientWhere,
  notDeletedAppts,
  notDeletedOrders,
  ordersForClientWhere,
  scopedApptTenantWhere,
  scopedTenantWhere,
} from "./scope";

export const CLIENT_PAGE_SIZE = 50;

export type ClientFilter = "ativos" | "removidos" | "todos";

export type ClientListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  deletedAt: Date | null;
};

export type ClientDetail = ClientListItem & {
  phoneE164: string | null;
  notes: string | null;
  birthDate: string | null;
  tags: string[];
  preferences: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  externalSource: string | null;
  externalId: string | null;
};

export type ClientTimelineAppointment = {
  id: string;
  startsAt: Date;
  status: string;
  serviceName: string | null;
  staffName: string | null;
  priceCents: number | null;
};

export type ClientTimelineOrder = {
  id: string;
  externalId: string | null;
  openedAt: Date;
  closedAt: Date | null;
  status: string;
  totalCents: number;
  itemCount: number;
  paymentMethod: string | null;
};

export type ClientOrderItem = {
  id: string;
  description: string;
  itemType: string;
  performedAt: Date | null;
  totalCents: number;
  staffName: string | null;
  orderExternalId: string | null;
};

export type ClientTopService = {
  description: string;
  count: number;
  totalCents: number;
};

export type ClientProfile = {
  stats: {
    appointmentsTotal: number;
    ordersTotal: number;
    ordersClosed: number;
    totalSpentCents: number;
    lastVisitAt: Date | null;
    waitlistTotal: number;
  };
  recentAppointments: ClientTimelineAppointment[];
  recentOrders: ClientTimelineOrder[];
  recentItems: ClientOrderItem[];
  topServices: ClientTopService[];
};

function clientFilterWhere(tenantId: string, filter: ClientFilter) {
  const base = eq(schema.clients.tenantId, tenantId);
  if (filter === "ativos") {
    return and(base, eq(schema.clients.isActive, true), isNull(schema.clients.deletedAt));
  }
  if (filter === "removidos") {
    return and(
      base,
      or(eq(schema.clients.isActive, false), isNotNull(schema.clients.deletedAt))
    );
  }
  return base;
}

export async function listClients(opts: {
  q?: string;
  filter?: ClientFilter;
  page?: number;
}) {
  const tenant = await requireTenantContext();
  const scope = await resolveBranchScope();
  const db = createDb();
  const filter = opts.filter ?? "ativos";
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();

  if (scope.isInactiveBranch) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize: CLIENT_PAGE_SIZE,
      totalPages: 1,
      filter,
      q: q ?? "",
    };
  }

  let where = clientFilterWhere(tenant.id, filter);
  if (q) {
    where = and(
      where,
      or(
        ilike(schema.clients.name, `%${q}%`),
        ilike(schema.clients.phone, `%${q}%`),
        ilike(schema.clients.email, `%${q}%`)
      )
    );
  }

  const [totalRow] = await db.select({ n: count() }).from(schema.clients).where(where);

  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      email: schema.clients.email,
      loyaltyPoints: schema.clients.loyaltyPoints,
      isActive: schema.clients.isActive,
      deletedAt: schema.clients.deletedAt,
    })
    .from(schema.clients)
    .where(where)
    .orderBy(asc(schema.clients.name))
    .limit(CLIENT_PAGE_SIZE)
    .offset((page - 1) * CLIENT_PAGE_SIZE);

  const total = Number(totalRow?.n ?? 0);
  return {
    rows,
    total,
    page,
    pageSize: CLIENT_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / CLIENT_PAGE_SIZE)),
    filter,
    q: q ?? "",
  };
}

export async function getClient(clientId: string): Promise<ClientDetail> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [row] = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      phoneE164: schema.clients.phoneE164,
      email: schema.clients.email,
      notes: schema.clients.notes,
      birthDate: schema.clients.birthDate,
      loyaltyPoints: schema.clients.loyaltyPoints,
      isActive: schema.clients.isActive,
      deletedAt: schema.clients.deletedAt,
      tags: schema.clients.tags,
      preferences: schema.clients.preferences,
      createdAt: schema.clients.createdAt,
      updatedAt: schema.clients.updatedAt,
      externalSource: schema.clients.externalSource,
      externalId: schema.clients.externalId,
    })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Cliente não encontrado");
  }

  return {
    ...row,
    birthDate: row.birthDate ?? null,
    tags: row.tags ?? [],
    preferences: row.preferences ?? {},
  };
}

export async function getClientProfile(clientId: string): Promise<ClientProfile> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const client = await getClient(clientId);
  const clientExternalId =
    client.externalSource === "appbarber" ? client.externalId : null;

  const apptWhere = andWhere(
    scopedApptTenantWhere(tenant.id),
    notDeletedAppts(),
    appointmentsForClientWhere(tenant.id, clientId, clientExternalId)
  );

  const orderWhere = andWhere(
    scopedTenantWhere(tenant.id),
    notDeletedOrders(),
    ordersForClientWhere(tenant.id, clientId, clientExternalId)
  );

  const [
    [apptStats],
    [orderStats],
    [waitlistStats],
    recentAppointments,
    recentOrders,
    orderIdsRows,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        lastAt: sql<Date | null>`max(${schema.appointments.startsAt})`,
      })
      .from(schema.appointments)
      .where(apptWhere),
    db
      .select({
        total: count(),
        closed: sql<number>`count(*) filter (where ${schema.orders.status} = 'closed')::int`,
        spent: sql<number>`coalesce(sum(case when ${schema.orders.status} = 'closed' then ${schema.orders.totalCents} else 0 end), 0)::int`,
      })
      .from(schema.orders)
      .where(orderWhere),
    db
      .select({ total: count() })
      .from(schema.waitlistEntries)
      .where(
        and(
          eq(schema.waitlistEntries.tenantId, tenant.id),
          or(
            eq(schema.waitlistEntries.clientId, clientId),
            client.phoneE164
              ? sql`regexp_replace(coalesce(${schema.waitlistEntries.phone}, ''), '\\D', '', 'g') = regexp_replace(${client.phoneE164}, '\\D', '', 'g')`
              : sql`false`
          )
        )
      ),
    db
      .select({
        id: schema.appointments.id,
        startsAt: schema.appointments.startsAt,
        status: schema.appointments.status,
        serviceName: schema.services.name,
        staffName: schema.staff.name,
        priceCents: schema.appointments.priceCents,
      })
      .from(schema.appointments)
      .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
      .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
      .where(apptWhere)
      .orderBy(desc(schema.appointments.startsAt))
      .limit(20),
    db
      .select({
        id: schema.orders.id,
        externalId: schema.orders.externalId,
        openedAt: schema.orders.openedAt,
        closedAt: schema.orders.closedAt,
        status: schema.orders.status,
        totalCents: schema.orders.totalCents,
        itemCount: sql<number>`(
          select count(*)::int from ${schema.orderItems} oi
          where oi.order_id = ${schema.orders.id}
        )`.as("item_count"),
        paymentMethod: sql<string | null>`(
          select p.method from ${schema.payments} p
          where p.order_id = ${schema.orders.id}
          order by p.paid_at desc
          limit 1
        )`.as("payment_method"),
      })
      .from(schema.orders)
      .where(orderWhere)
      .orderBy(desc(schema.orders.openedAt))
      .limit(20),
    db.select({ id: schema.orders.id }).from(schema.orders).where(orderWhere),
  ]);

  const orderIds = orderIdsRows.map((r) => r.id);

  let recentItems: ClientOrderItem[] = [];
  let topServices: ClientTopService[] = [];

  if (orderIds.length > 0) {
    [recentItems, topServices] = await Promise.all([
      db
        .select({
          id: schema.orderItems.id,
          description: schema.orderItems.description,
          itemType: schema.orderItems.itemType,
          performedAt: schema.orderItems.performedAt,
          totalCents: schema.orderItems.totalCents,
          staffName: schema.staff.name,
          orderExternalId: schema.orders.externalId,
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
        .leftJoin(schema.staff, eq(schema.orderItems.staffId, schema.staff.id))
        .where(
          and(
            eq(schema.orderItems.tenantId, tenant.id),
            inArray(schema.orderItems.orderId, orderIds)
          )
        )
        .orderBy(desc(sql`coalesce(${schema.orderItems.performedAt}, ${schema.orders.openedAt})`))
        .limit(25),
      db
        .select({
          description: schema.orderItems.description,
          count: sql<number>`count(*)::int`,
          totalCents: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
        })
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.tenantId, tenant.id),
            inArray(schema.orderItems.orderId, orderIds),
            eq(schema.orderItems.itemType, "service")
          )
        )
        .groupBy(schema.orderItems.description)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
    ]);
  }

  return {
    stats: {
      appointmentsTotal: Number(apptStats?.total ?? 0),
      ordersTotal: Number(orderStats?.total ?? 0),
      ordersClosed: Number(orderStats?.closed ?? 0),
      totalSpentCents: Number(orderStats?.spent ?? 0),
      lastVisitAt: apptStats?.lastAt ?? null,
      waitlistTotal: Number(waitlistStats?.total ?? 0),
    },
    recentAppointments,
    recentOrders: recentOrders.map((o) => ({
      ...o,
      itemCount: Number(o.itemCount),
      paymentMethod: o.paymentMethod ?? null,
    })),
    recentItems,
    topServices: topServices.map((s) => ({
      description: s.description,
      count: Number(s.count),
      totalCents: Number(s.totalCents),
    })),
  };
}
