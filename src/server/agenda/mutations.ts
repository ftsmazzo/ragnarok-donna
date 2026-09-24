import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { formatTimeSp } from "@/lib/datetime";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { requireCapability } from "../permissions/guards";
import { isBarberRole } from "../permissions/roles";
import { assertOwnStaffAccess } from "../permissions/staff-scope";
import { HOUSE_RULES, isLockedStaffName, isLunchTimeHm } from "../house-rules/defaults";
import { getAppointmentDetail } from "./queries";
import { rangesOverlap } from "./utils";
import type { AppointmentEditScope } from "./types";
import type { AppSession } from "../types";

/** Barbeiro só opera a própria coluna — dono/recepção passam direto. */
async function assertBarberOwnStaff(
  session: AppSession,
  staffId: string | null | undefined
): Promise<void> {
  if (!isBarberRole(session.role)) return;
  if (!staffId) throw new ForbiddenError();
  await assertOwnStaffAccess(session, staffId);
}

export type ActionResult =
  | { ok: true; id: string; warning?: string }
  | { ok: false; error: string };

type WriteInput = {
  staffId: string;
  date: string;
  hour: number;
  /** 0–55, múltiplo de 5 — início fino do slot. */
  minute?: number;
  durationMin: number;
  clientId?: string;
  serviceId?: string;
  notes?: string;
  isEncaixe?: boolean;
  isBlock?: boolean;
  /** Meta extra (ex.: visita de pacote com vários serviços). */
  extraMeta?: Record<string, unknown>;
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

async function assertStaffBookable(
  tenantId: string,
  staffId: string
): Promise<{ id: string; branchId: string | null }> {
  const db = createDb();
  const [s] = await db
    .select({ id: schema.staff.id, branchId: schema.staff.branchId })
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
  return s;
}

/** Unidade do agendamento: staff → sessão → primeira branch do tenant. */
async function resolveAppointmentBranchId(
  tenantId: string,
  staffBranchId: string | null | undefined,
  sessionBranchId?: string | null
): Promise<string | null> {
  if (staffBranchId) return staffBranchId;
  if (sessionBranchId) return sessionBranchId;
  const { listTenantBranches } = await import("../context/branch");
  const branches = await listTenantBranches(tenantId);
  return branches[0]?.id ?? null;
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
  const minute = raw.minute ?? 0;
  if (!Number.isInteger(minute) || minute < 0 || minute > 55 || minute % 5 !== 0) {
    throw new AppError("VALIDATION", "Minuto inválido (use de 5 em 5)");
  }
  const durationMin = raw.durationMin || 30;
  if (durationMin < 5 || durationMin > 480) {
    throw new AppError("VALIDATION", "Duração inválida");
  }
  return { durationMin, minute };
}

async function createSlot(raw: WriteInput): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "appointments.write");
    await assertBarberOwnStaff(session, raw.staffId);

    const tenant = await requireTenantContext();
    const staff = await assertStaffBookable(tenant.id, raw.staffId);
    const branchId = await resolveAppointmentBranchId(
      tenant.id,
      staff.branchId,
      session.branch?.id
    );

    const { durationMin, minute } = parseWriteInput(raw);
    const svc = await loadServiceDuration(tenant.id, raw.serviceId, durationMin);
    const finalDuration = durationMin || svc.durationMin;

    const start = new Date(
      `${raw.date}T${String(raw.hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`
    );
    const end = new Date(start.getTime() + finalDuration * 60_000);

    if (!raw.isEncaixe && !raw.isBlock) {
      await assertNoOverlap(tenant.id, raw.staffId, start, end);
    } else if (raw.isBlock) {
      await assertNoOverlap(tenant.id, raw.staffId, start, end);
    }

    if (raw.isBlock) {
      const reason = raw.notes?.trim() || "";
      if (reason.length < 3) {
        throw new AppError("VALIDATION", "Informe o motivo do bloqueio");
      }
      const db = createDb();
      const [row] = await db
        .insert(schema.appointments)
        .values({
          tenantId: tenant.id,
          branchId,
          staffId: raw.staffId,
          startsAt: start,
          endsAt: end,
          status: "blocked",
          source: "painel",
          notes: reason,
          meta: {
            blockedByUserId: session.user.id,
            blockedByName: session.user.name ?? session.user.email ?? "Usuário",
            blockedAt: new Date().toISOString(),
            blockReason: reason,
          },
        })
        .returning({ id: schema.appointments.id });
      return { ok: true, id: row.id };
    }

    if (!raw.clientId) {
      throw new AppError("VALIDATION", "Cliente obrigatório");
    }

    const db = createDb();
    const [client] = await db
      .select({ id: schema.clients.id, preferences: schema.clients.preferences })
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

    const [staffRow] = await db
      .select({ name: schema.staff.name, nickname: schema.staff.nickname })
      .from(schema.staff)
      .where(and(eq(schema.staff.id, raw.staffId), eq(schema.staff.tenantId, tenant.id)))
      .limit(1);

    const warnings: string[] = [];
    const hm = formatTimeSp(start);
    const weekday = start.toLocaleDateString("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
    });

    // Encaixe: ignora almoço e jornada — só aviso amigável no sábado.
    if (raw.isEncaixe && isLunchTimeHm(hm)) {
      warnings.push(
        `Encaixe no horário de almoço (${HOUSE_RULES.lunchStartHm}–${HOUSE_RULES.lunchEndHm}).`
      );
    }

    if (raw.isEncaixe && HOUSE_RULES.saturdayEncaixeWarn && weekday === "Sat") {
      warnings.push(
        "Sábado: encaixe registrado — deixe ~30 min livres fora do almoço se der."
      );
    }

    if (isLockedStaffName(staffRow?.name) || isLockedStaffName(staffRow?.nickname)) {
      const pref = client.preferences as Record<string, unknown> | null;
      const askedFor =
        typeof pref?.preferredStaffId === "string" && pref.preferredStaffId === raw.staffId;
      const noteAsk = /luciano|diogo|pediu|prefer/i.test(raw.notes ?? "");
      if (!askedFor && !noteAsk) {
        warnings.push(
          `${staffRow?.name ?? "Profissional"} costuma atender só a carteira dele — confira se o cliente pediu por ele.`
        );
      }
    }

    const [row] = await db
      .insert(schema.appointments)
      .values({
        tenantId: tenant.id,
        branchId,
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
        meta: {
          ...(warnings.length
            ? { houseRuleWarnings: warnings, saturdayEncaixe: weekday === "Sat" && raw.isEncaixe }
            : {}),
          ...(raw.extraMeta ?? {}),
        },
      })
      .returning({ id: schema.appointments.id });

    return { ok: true, id: row.id, warning: warnings[0] };
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
      await assertBarberOwnStaff(session, appt.staffId);
    } else if (hasCapability(session.role, "appointments.write")) {
      await assertBarberOwnStaff(session, appt.staffId);
    } else if (hasCapability(session.role, "appointments.status_own")) {
      await assertBarberOwnStaff(session, appt.staffId);
      const barberAllowed = ["arrived", "scheduled", "completed", "confirmed"];
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
        confirmedAt:
          status === "confirmed"
            ? new Date()
            : status === "scheduled"
              ? null
              : undefined,
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
    await assertBarberOwnStaff(session, appt.staffId);
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

export async function patchAppointmentMeta(
  id: string,
  patch: { noPreference?: boolean; addTag?: string; clearTags?: boolean }
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (
      !hasCapability(session.role, "appointments.write") &&
      !hasCapability(session.role, "appointments.status_own")
    ) {
      throw new ForbiddenError();
    }

    const appt = await getAppointmentDetail(id);
    if (appt.status === "blocked") {
      throw new AppError("VALIDATION", "Bloqueio não aceita tag/preferência");
    }
    await assertBarberOwnStaff(session, appt.staffId);

    const tenant = await requireTenantContext();
    const db = createDb();
    const [row] = await db
      .select({ meta: schema.appointments.meta })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.id, id),
          eq(schema.appointments.tenantId, tenant.id),
          isNull(schema.appointments.deletedAt)
        )
      )
      .limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Agendamento não encontrado");

    const meta = { ...(row.meta ?? {}) } as Record<string, unknown>;
    if (typeof patch.noPreference === "boolean") {
      meta.noPreference = patch.noPreference;
    }
    if (patch.clearTags) {
      meta.tags = [];
    }
    if (patch.addTag) {
      const tag = patch.addTag.trim().slice(0, 40);
      if (!tag) throw new AppError("VALIDATION", "Tag vazia");
      const prev = Array.isArray(meta.tags)
        ? meta.tags.filter((t): t is string => typeof t === "string")
        : [];
      if (!prev.includes(tag)) prev.push(tag);
      meta.tags = prev.slice(0, 8);
    }

    await db
      .update(schema.appointments)
      .set({ meta, updatedAt: new Date() })
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
    return { ok: false, error: "Não foi possível atualizar o agendamento" };
  }
}

/** Edição granular (Tipo AppBarber): só os campos do escopo são aplicados. */
export async function updateAppointment(input: {
  id: string;
  scope: AppointmentEditScope;
  date?: string;
  hour?: number;
  minute?: number;
  durationMin?: number;
  staffId?: string;
  serviceId?: string | null;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "appointments.write");

    const appt = await getAppointmentDetail(input.id);
    await assertBarberOwnStaff(session, appt.staffId);
    if (appt.status === "blocked") {
      throw new AppError("VALIDATION", "Use edição de bloqueio / remover");
    }
    if (["cancelled", "completed", "no_show"].includes(appt.status)) {
      throw new AppError("VALIDATION", "Status não permite editar");
    }

    const tenant = await requireTenantContext();
    const scope = input.scope;
    const touchTime = scope === "time" || scope === "time_service" || scope === "time_staff" || scope === "all";
    const touchService =
      scope === "service" || scope === "time_service" || scope === "service_staff" || scope === "all";
    const touchStaff =
      scope === "staff" || scope === "time_staff" || scope === "service_staff" || scope === "all";
    const touchDuration = scope === "duration" || scope === "all" || touchTime || touchService;

    const { formatDateSp, hourInSp, minuteInSp } = await import("@/lib/datetime");

    let staffId = appt.staffId;
    let branchId: string | null | undefined;
    if (touchStaff) {
      if (!input.staffId) throw new AppError("VALIDATION", "Profissional obrigatório");
      await assertBarberOwnStaff(session, input.staffId);
      const staff = await assertStaffBookable(tenant.id, input.staffId);
      staffId = input.staffId;
      branchId = staff.branchId ?? session.branch?.id ?? null;
    }
    if (!staffId) throw new AppError("VALIDATION", "Profissional inválido");

    let serviceId = appt.serviceId;
    let priceCents = appt.priceCents;
    if (touchService) {
      serviceId = input.serviceId || null;
    }

    let startsAt = appt.startsAt;
    let durationMin = Math.max(
      5,
      Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000)
    );

    if (touchTime) {
      const date = input.date || formatDateSp(appt.startsAt);
      const hour = input.hour ?? hourInSp(appt.startsAt);
      const minute = input.minute ?? minuteInSp(appt.startsAt);
      if (hour < 6 || hour > 22) {
        throw new AppError("VALIDATION", "Horário fora do expediente");
      }
      if (!Number.isInteger(minute) || minute < 0 || minute > 55 || minute % 5 !== 0) {
        throw new AppError("VALIDATION", "Minuto inválido (use de 5 em 5)");
      }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new AppError("VALIDATION", "Data inválida");
      }
      startsAt = new Date(
        `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`
      );
    }

    if (touchService && serviceId) {
      const svc = await loadServiceDuration(tenant.id, serviceId, durationMin);
      priceCents = svc.priceCents;
      if (input.durationMin == null && !touchTime) {
        durationMin = svc.durationMin;
      }
    }

    if (touchDuration && input.durationMin != null) {
      if (input.durationMin < 5 || input.durationMin > 480) {
        throw new AppError("VALIDATION", "Duração inválida");
      }
      durationMin = input.durationMin;
    }

    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

    if (!appt.isEncaixe) {
      await assertNoOverlap(tenant.id, staffId, startsAt, endsAt, input.id);
    }

    const db = createDb();
    await db
      .update(schema.appointments)
      .set({
        staffId,
        ...(branchId !== undefined ? { branchId } : {}),
        serviceId,
        startsAt,
        endsAt,
        priceCents: priceCents ?? null,
        notes: input.notes !== undefined ? input.notes.trim() || null : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.appointments.id, input.id),
          eq(schema.appointments.tenantId, tenant.id)
        )
      );

    return { ok: true, id: input.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível editar o agendamento" };
  }
}

export async function setAppointmentEncaixe(
  id: string,
  isEncaixe: boolean
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "appointments.write");

    const appt = await getAppointmentDetail(id);
    await assertBarberOwnStaff(session, appt.staffId);
    if (appt.status === "blocked") {
      throw new AppError("VALIDATION", "Bloqueio não vira encaixe");
    }
    if (["cancelled", "completed", "no_show"].includes(appt.status)) {
      throw new AppError("VALIDATION", "Status não permite marcar encaixe");
    }

    const tenant = await requireTenantContext();
    const db = createDb();
    await db
      .update(schema.appointments)
      .set({ isEncaixe, updatedAt: new Date() })
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
    return { ok: false, error: "Não foi possível marcar encaixe" };
  }
}
