import { and, asc, count, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { resolveBranchScope, withBranchScope } from "../context/branch-scope";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { isBarberRole } from "../permissions/roles";
import { assertOwnStaffAccess, resolveSessionStaffId } from "../permissions/staff-scope";
import { NotFoundError } from "../errors";
import type {
  AgendaAppointment,
  AgendaDayData,
  AgendaPermissions,
  AgendaPickerClient,
  AgendaPickerService,
} from "./types";
import { buildAgendaHours, dayBoundsSp } from "./utils";

export async function getAgendaPermissions(): Promise<AgendaPermissions> {
  const session = await requireSession();
  const scopedStaffId = isBarberRole(session.role)
    ? await resolveSessionStaffId(session)
    : null;

  return {
    canWrite: hasCapability(session.role, "appointments.write"),
    canCancel: hasCapability(session.role, "appointments.cancel"),
    canUpdateStatus:
      hasCapability(session.role, "appointments.write") ||
      hasCapability(session.role, "appointments.status_own"),
    canOpenOrder: hasCapability(session.role, "orders.write"),
    scopedStaffId,
  };
}

export async function getAgendaDay(dateStr?: string, staffFilter?: string): Promise<AgendaDayData> {
  const tenant = await requireTenantContext();
  const session = await requireSession();
  const scope = await resolveBranchScope();
  const perms = await getAgendaPermissions();
  const { date, start, end } = dayBoundsSp(dateStr);
  const db = createDb();

  if (scope.isInactiveBranch) {
    return {
      tenantName: tenant.name,
      date,
      staff: [],
      appointments: [],
      hours: buildAgendaHours([]),
      waitlistCount: 0,
      openOrdersCount: 0,
      totalAppointments: 0,
    };
  }

  let staffWhere = withBranchScope(
    scope,
    schema.staff.branchId,
    and(
      eq(schema.staff.tenantId, tenant.id),
      eq(schema.staff.isActive, true),
      eq(schema.staff.isBookable, true),
      isNull(schema.staff.deletedAt)
    )
  );

  if (perms.scopedStaffId) {
    staffWhere = and(staffWhere, eq(schema.staff.id, perms.scopedStaffId));
  } else if (staffFilter) {
    staffWhere = and(staffWhere, eq(schema.staff.id, staffFilter));
  }

  const staff = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      color: schema.staff.color,
    })
    .from(schema.staff)
    .where(staffWhere)
    .orderBy(asc(schema.staff.name));

  let apptWhere = withBranchScope(
    scope,
    schema.appointments.branchId,
    and(
      eq(schema.appointments.tenantId, tenant.id),
      gte(schema.appointments.startsAt, start),
      lte(schema.appointments.startsAt, end),
      isNull(schema.appointments.deletedAt)
    )
  );

  if (perms.scopedStaffId) {
    apptWhere = and(apptWhere, eq(schema.appointments.staffId, perms.scopedStaffId));
  } else if (staffFilter) {
    apptWhere = and(apptWhere, eq(schema.appointments.staffId, staffFilter));
  }

  const rows = await db
    .select({
      id: schema.appointments.id,
      staffId: schema.appointments.staffId,
      clientId: schema.appointments.clientId,
      serviceId: schema.appointments.serviceId,
      clientName: schema.clients.name,
      serviceName: schema.services.name,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
      status: schema.appointments.status,
      isEncaixe: schema.appointments.isEncaixe,
      notes: schema.appointments.notes,
      priceCents: schema.appointments.priceCents,
      orderId: schema.appointments.orderId,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .where(apptWhere)
    .orderBy(asc(schema.appointments.startsAt));

  const appointments: AgendaAppointment[] = rows.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    clientId: r.clientId,
    clientName: r.clientName ?? (r.status === "blocked" ? "Bloqueio" : "Sem cliente"),
    serviceId: r.serviceId,
    serviceName: r.serviceName,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    status: r.status,
    isEncaixe: r.isEncaixe,
    notes: r.notes,
    priceCents: r.priceCents,
    orderId: r.orderId,
  }));

  const [waitlistRow] = scope.isInactiveBranch
    ? [{ n: 0 }]
    : await db
        .select({ n: count() })
        .from(schema.waitlistEntries)
        .innerJoin(schema.staff, eq(schema.waitlistEntries.staffId, schema.staff.id))
        .where(
          and(
            eq(schema.waitlistEntries.tenantId, tenant.id),
            eq(schema.waitlistEntries.status, "waiting"),
            withBranchScope(scope, schema.staff.branchId)
          )
        );

  const [ordersRow] = await db
    .select({ n: count() })
    .from(schema.orders)
    .where(
      withBranchScope(
        scope,
        schema.orders.branchId,
        and(
          eq(schema.orders.tenantId, tenant.id),
          eq(schema.orders.status, "open"),
          gte(schema.orders.openedAt, start),
          lte(schema.orders.openedAt, end),
          isNull(schema.orders.deletedAt)
        )
      )
    );

  return {
    tenantName: tenant.name,
    date,
    staff,
    appointments,
    hours: buildAgendaHours(appointments),
    waitlistCount: Number(waitlistRow?.n ?? 0),
    openOrdersCount: Number(ordersRow?.n ?? 0),
    totalAppointments: appointments.filter((a) => a.status !== "blocked").length,
  };
}

export async function getAppointmentDetail(id: string): Promise<AgendaAppointment> {
  const tenant = await requireTenantContext();
  const session = await requireSession();
  const db = createDb();

  const [row] = await db
    .select({
      id: schema.appointments.id,
      staffId: schema.appointments.staffId,
      clientId: schema.appointments.clientId,
      serviceId: schema.appointments.serviceId,
      clientName: schema.clients.name,
      serviceName: schema.services.name,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
      status: schema.appointments.status,
      isEncaixe: schema.appointments.isEncaixe,
      notes: schema.appointments.notes,
      priceCents: schema.appointments.priceCents,
      orderId: schema.appointments.orderId,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .where(
      and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.tenantId, tenant.id),
        isNull(schema.appointments.deletedAt)
      )
    )
    .limit(1);

  if (!row) throw new NotFoundError("Agendamento não encontrado");

  if (row.staffId && isBarberRole(session.role)) {
    await assertOwnStaffAccess(session, row.staffId);
  }

  return {
    id: row.id,
    staffId: row.staffId,
    clientId: row.clientId,
    clientName: row.clientName ?? (row.status === "blocked" ? "Bloqueio" : "Sem cliente"),
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    isEncaixe: row.isEncaixe,
    notes: row.notes,
    priceCents: row.priceCents,
    orderId: row.orderId,
  };
}

export async function searchClientsForAgenda(q?: string): Promise<AgendaPickerClient[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const term = q?.trim();

  let where = and(
    eq(schema.clients.tenantId, tenant.id),
    eq(schema.clients.isActive, true),
    isNull(schema.clients.deletedAt)
  );

  if (term && term.length >= 2) {
    const like = `%${term}%`;
    where = and(
      where,
      or(ilike(schema.clients.name, like), ilike(schema.clients.phone, like))
    );
  }

  return db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
    })
    .from(schema.clients)
    .where(where)
    .orderBy(asc(schema.clients.name))
    .limit(30);
}

export async function listServicesForAgenda(): Promise<AgendaPickerService[]> {
  const tenant = await requireTenantContext();
  const db = createDb();

  return db
    .select({
      id: schema.services.id,
      name: schema.services.name,
      durationMin: schema.services.durationMin,
      priceCents: schema.services.priceCents,
    })
    .from(schema.services)
    .where(
      and(
        eq(schema.services.tenantId, tenant.id),
        eq(schema.services.isActive, true),
        isNull(schema.services.deletedAt)
      )
    )
    .orderBy(asc(schema.services.name));
}
