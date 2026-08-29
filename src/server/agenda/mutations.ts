import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { requireCapability } from "../permissions/guards";
import { assertOwnStaffAccess } from "../permissions/staff-scope";
import { getAppointmentDetail } from "./queries";
import { rangesOverlap } from "./utils";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

type WriteInput = {
  staffId: string;
  date: string;
  hour: number;
  durationMin: number;
  clientId?: string;
  serviceId?: string;
  notes?: string;
  isEncaixe?: boolean;
  isBlock?: boolean;
};

const ACTIVE_CONFLICT = ["scheduled", "confirmed", "arrived", "in_progress", "blocked"] as const;

async function loadServiceDuration(
  tenantId: string,
  serviceId: string | undefined,
  fallback: number
): Promise<{ durationMin: number; priceCents: number | null }> {
  if (!serviceId) return { durationMin: fallback, priceCents: null };
  const db = createDb();
  const [svc] = await db
    .select({
      durationMin: schema.services.durationMin,
      priceCents: schema.services.priceCents,
    })
    .from(schema.services)
    .where(
      and(
        eq(schema.services.id, serviceId),
        eq(schema.services.tenantId, tenantId),
        isNull(schema.services.deletedAt)
      )
    )
    .limit(1);
  if (!svc) throw new AppError("VALIDATION", "Serviço inválido");
  return { durationMin: svc.durationMin, priceCents: svc.priceCents };
}

async function assertStaffBookable(tenantId: string, staffId: string) {
  const db = createDb();
  const [s] = await db
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.id, staffId),
        eq(schema.staff.tenantId, tenantId),
        eq(schema.staff.isActive, true),
        eq(schema.staff.isBookable, true),
        isNull(schema.staff.deletedAt)
      )
    )
    .limit(1);
  if (!s) throw new AppError("VALIDATION", "Profissional inválido");
}

async function assertNoOverlap(
  tenantId: string,
  staffId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string
) {
  const db = createDb();
  const rows = await db
    .select({
      id: schema.appointments.id,
      startsAt: schema.appointments.startsAt,
      endsAt: schema.appointments.endsAt,
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, tenantId),
        eq(schema.appointments.staffId, staffId),
        isNull(schema.appointments.deletedAt),
        inArray(schema.appointments.status, [...ACTIVE_CONFLICT]),
        excludeId ? ne(schema.appointments.id, excludeId) : undefined
      )
    );

  for (const row of rows) {
    if (rangesOverlap(startsAt, endsAt, row.startsAt, row.endsAt)) {
      throw new AppError("CONFLICT", "Horário conflita com outro agendamento ou bloqueio");
    }
  }
}

function parseWriteInput(raw: WriteInput) {
  if (!raw.staffId) throw new AppError("VALIDATION", "Profissional obrigatório");
  if (!raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    throw new AppError("VALIDATION", "Data inválida");
  }
  if (raw.hour < 6 || raw.hour > 22) {
    throw new AppError("VALIDATION", "Horário fora do expediente");
  }
  const durationMin = raw.durationMin || 30;
  if (durationMin < 5 || durationMin > 480) {
    throw new AppError("VALIDATION", "Duração inválida");
  }
  return durationMin;
}

async function createSlot(raw: WriteInput): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "appointments.write");

    const tenant = await requireTenantContext();
    await assertStaffBookable(tenant.id, raw.staffId);

    const durationMin = parseWriteInput(raw);
    const svc = await loadServiceDuration(tenant.id, raw.serviceId, durationMin);
    const finalDuration = raw.isBlock ? durationMin : svc.durationMin;

    const start = new Date(
      `${raw.date}T${String(raw.hour).padStart(2, "0")}:00:00-03:00`
    );
    const end = new Date(start.getTime() + finalDuration * 60_000);

    if (!raw.isEncaixe && !raw.isBlock) {
      await assertNoOverlap(tenant.id, raw.staffId, start, end);
    } else if (raw.isBlock) {
      await assertNoOverlap(tenant.id, raw.staffId, start, end);
    }

    if (raw.isBlock) {
      const db = createDb();
      const [row] = await db
        .insert(schema.appointments)
        .values({
          tenantId: tenant.id,
          staffId: raw.staffId,
          startsAt: start,
          endsAt: end,
          status: "blocked",
          source: "painel",
          notes: raw.notes?.trim() || null,
        })
        .returning({ id: schema.appointments.id });
      return { ok: true, id: row.id };
    }

    if (!raw.clientId) {
      throw new AppError("VALIDATION", "Cliente obrigatório");
    }

    const db = createDb();
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.id, raw.clientId),
          eq(schema.clients.tenantId, tenant.id),
          isNull(schema.clients.deletedAt)
        )
      )
      .limit(1);
    if (!client) throw new AppError("VALIDATION", "Cliente inválido");

    const [row] = await db
      .insert(schema.appointments)
      .values({
        tenantId: tenant.id,
        staffId: raw.staffId,
        clientId: raw.clientId,
        serviceId: raw.serviceId || null,
        startsAt: start,
        endsAt: end,
        status: "scheduled",
        source: "painel",
        isEncaixe: Boolean(raw.isEncaixe),
        priceCents: svc.priceCents,
        notes: raw.notes?.trim() || null,
      })
      .returning({ id: schema.appointments.id });

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível salvar o agendamento" };
  }
}

export async function scheduleAppointment(raw: WriteInput): Promise<ActionResult> {
  return createSlot({ ...raw, isEncaixe: false, isBlock: false });
}

export async function scheduleEncaixe(raw: WriteInput): Promise<ActionResult> {
  return createSlot({ ...raw, isEncaixe: true, isBlock: false });
}

export async function createBlock(raw: WriteInput): Promise<ActionResult> {
  return createSlot({ ...raw, isBlock: true, isEncaixe: false });
}

export async function updateAppointmentStatus(
  id: string,
  status: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const appt = await getAppointmentDetail(id);

    const allowed = [
      "scheduled",
      "confirmed",
      "arrived",
      "in_progress",
      "completed",
      "cancelled",
      "no_show",
    ];
    if (!allowed.includes(status)) {
      throw new AppError("VALIDATION", "Status inválido");
    }

    if (status === "cancelled" || status === "no_show") {
      requireCapability(session, "appointments.cancel");
    } else if (hasCapability(session.role, "appointments.write")) {
      // ok
    } else if (hasCapability(session.role, "appointments.status_own")) {
      if (!appt.staffId) throw new ForbiddenError();
      await assertOwnStaffAccess(session, appt.staffId);
      const barberAllowed = ["arrived", "in_progress", "completed", "confirmed"];
      if (!barberAllowed.includes(status)) {
        throw new ForbiddenError("Barbeiro não pode alterar para este status");
      }
    } else {
      throw new ForbiddenError();
    }

    if (appt.status === "blocked") {
      throw new AppError("VALIDATION", "Use remover bloqueio");
    }

    const tenant = await requireTenantContext();
    const db = createDb();
    await db
      .update(schema.appointments)
      .set({
        status: status as typeof schema.appointments.$inferInsert.status,
        updatedAt: new Date(),
        confirmedAt: status === "confirmed" ? new Date() : undefined,
      })
      .where(
        and(
          eq(schema.appointments.id, id),
          eq(schema.appointments.tenantId, tenant.id)
        )
      );

    if (status === "cancelled" || status === "no_show") {
      try {
        const { promoteWaitlistOnCancel } = await import("@/server/agent/domain-waitlist");
        await promoteWaitlistOnCancel({
          tenantId: tenant.id,
          staffId: appt.staffId,
          serviceId: appt.serviceId,
          startsAt: appt.startsAt,
        });
      } catch (err) {
        console.error("[updateAppointmentStatus] waitlist promote", err);
      }
    }

    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível atualizar o status" };
  }
}

export async function removeBlock(id: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "appointments.write");

    const appt = await getAppointmentDetail(id);
    if (appt.status !== "blocked") {
      throw new AppError("VALIDATION", "Não é um bloqueio");
    }

    const tenant = await requireTenantContext();
    const db = createDb();
    await db
      .update(schema.appointments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.appointments.id, id),
          eq(schema.appointments.tenantId, tenant.id)
        )
      );

    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível remover o bloqueio" };
  }
}
