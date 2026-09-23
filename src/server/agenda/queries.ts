import { and, asc, count, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { resolveBranchScope, withBranchScope, withCatalogBranchScope } from "../context/branch-scope";
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
      clientPhone: schema.clients.phone,
      clientPhoneE164: schema.clients.phoneE164,
      clientAccountBalanceCents: schema.clients.accountBalanceCents,
      clientPreferences: schema.clients.preferences,
      clientAvatarUrl: schema.clients.avatarUrl,
      serviceName: schema.services.name,
      servicePriceCents: schema.services.priceCents,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
      status: schema.appointments.status,
      isEncaixe: schema.appointments.isEncaixe,
      notes: schema.appointments.notes,
      priceCents: schema.appointments.priceCents,
      orderId: schema.appointments.orderId,
      orderStatus: schema.orders.status,
      orderTotalCents: schema.orders.totalCents,
      staffName: schema.staff.name,
      meta: schema.appointments.meta,
    })
    .from(schema.appointments)
    .leftJoin(
      schema.clients,
      and(
        eq(schema.appointments.clientId, schema.clients.id),
        eq(schema.clients.tenantId, schema.appointments.tenantId)
      )
    )
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .leftJoin(schema.orders, eq(schema.appointments.orderId, schema.orders.id))
    .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
    .where(apptWhere)
    .orderBy(asc(schema.appointments.startsAt));

  const appointments: AgendaAppointment[] = rows.map((r) => mapAgendaAppointment(r));

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
      clientPhone: schema.clients.phone,
      clientPhoneE164: schema.clients.phoneE164,
      clientAccountBalanceCents: schema.clients.accountBalanceCents,
      clientPreferences: schema.clients.preferences,
      clientAvatarUrl: schema.clients.avatarUrl,
      serviceName: schema.services.name,
      servicePriceCents: schema.services.priceCents,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
      status: schema.appointments.status,
      isEncaixe: schema.appointments.isEncaixe,
      notes: schema.appointments.notes,
      priceCents: schema.appointments.priceCents,
      orderId: schema.appointments.orderId,
      orderStatus: schema.orders.status,
      orderTotalCents: schema.orders.totalCents,
      staffName: schema.staff.name,
      meta: schema.appointments.meta,
    })
    .from(schema.appointments)
    .leftJoin(
      schema.clients,
      and(
        eq(schema.appointments.clientId, schema.clients.id),
        eq(schema.clients.tenantId, schema.appointments.tenantId)
      )
    )
    .leftJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .leftJoin(schema.orders, eq(schema.appointments.orderId, schema.orders.id))
    .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
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

  const mapped = mapAgendaAppointment(row);
  if (mapped.seriesId) {
    const { listSeriesDates } = await import("./recurring");
    mapped.seriesUpcoming = await listSeriesDates(tenant.id, mapped.seriesId);
  }
  return mapped;
}

function mapAgendaAppointment(r: {
  id: string;
  staffId: string | null;
  staffName?: string | null;
  clientId: string | null;
  clientName: string | null;
  clientPhone?: string | null;
  clientPhoneE164?: string | null;
  clientAccountBalanceCents?: number | null;
  clientPreferences?: Record<string, unknown> | null;
  clientAvatarUrl: string | null;
  serviceId: string | null;
  serviceName: string | null;
  servicePriceCents?: number | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  isEncaixe: boolean;
  notes: string | null;
  priceCents: number | null;
  orderId: string | null;
  orderStatus?: string | null;
  orderTotalCents?: number | null;
  meta: Record<string, unknown> | null;
}): AgendaAppointment {
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  const rawTags = meta.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  const priceCents =
    r.priceCents != null && r.priceCents > 0
      ? r.priceCents
      : r.orderTotalCents != null && r.orderTotalCents > 0
        ? r.orderTotalCents
        : r.servicePriceCents != null && r.servicePriceCents > 0
          ? r.servicePriceCents
          : r.priceCents;
  const phoneRaw = r.clientPhone?.trim() || r.clientPhoneE164?.trim() || null;
  const prefs = (r.clientPreferences ?? {}) as Record<string, unknown>;
  const hairPref =
    typeof prefs.hairPreference === "string" && prefs.hairPreference.trim()
      ? prefs.hairPreference.trim().slice(0, 120)
      : null;
  return {
    id: r.id,
    staffId: r.staffId,
    staffName: r.staffName ?? null,
    clientId: r.clientId,
    clientName: r.clientName ?? (r.status === "blocked" ? "Bloqueio" : "Sem cliente"),
    clientPhone: phoneRaw,
    clientAccountBalanceCents:
      r.clientId != null ? (r.clientAccountBalanceCents ?? 0) : null,
    clientHairPreference: hairPref,
    clientAvatarUrl: r.clientAvatarUrl ?? null,
    serviceId: r.serviceId,
    serviceName: r.serviceName,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    status: r.status,
    isEncaixe: r.isEncaixe,
    notes: r.notes,
    priceCents,
    orderId: r.orderId,
    orderStatus: r.orderStatus ?? null,
    blockedByName: typeof meta.blockedByName === "string" ? meta.blockedByName : null,
    seriesId: typeof meta.seriesId === "string" ? meta.seriesId : null,
    seriesConflict: typeof meta.seriesConflict === "string" ? meta.seriesConflict : null,
    noPreference: meta.noPreference === true,
    tags,
    visitLabel: typeof meta.visitLabel === "string" ? meta.visitLabel : null,
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
  const scope = await resolveBranchScope();
  const db = createDb();

  const where = withCatalogBranchScope(
    scope,
    schema.services.branchId,
    and(
      eq(schema.services.tenantId, tenant.id),
      eq(schema.services.isActive, true),
      isNull(schema.services.deletedAt)
    )
  );

  return db
    .select({
      id: schema.services.id,
      name: schema.services.name,
      durationMin: schema.services.durationMin,
      priceCents: schema.services.priceCents,
    })
    .from(schema.services)
    .where(where)
    .orderBy(asc(schema.services.name));
}
