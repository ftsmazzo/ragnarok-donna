import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireBranchContext } from "../context/branch";
import { requireCapability } from "../permissions/guards";
import { requireSession, requireTenantContext } from "../context/tenant";
import { getStaffMember } from "./queries";
import { normalizeEmail, normalizeName, normalizePhone } from "../clients/normalize";

export type StaffInput = {
  name: string;
  nickname?: string;
  phone?: string;
  email?: string;
  color?: string;
  commissionPct?: string;
  isBookable?: boolean;
  branchId?: string | null;
  avatarUrl?: string | null;
};

export type ScheduleSlotInput = {
  weekday: number;
  slotIndex: number;
  startTime: string;
  endTime: string;
};

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

function parseStaffInput(raw: StaffInput): StaffInput & { commissionBps: number | null } {
  const name = normalizeName(raw.name);
  if (!name || name.length < 2) {
    throw new AppError("VALIDATION", "Nome deve ter ao menos 2 caracteres");
  }

  let commissionBps: number | null = null;
  const pct = raw.commissionPct?.trim();
  if (pct) {
    const n = Number(pct.replace(",", "."));
    if (Number.isNaN(n) || n < 0 || n > 100) {
      throw new AppError("VALIDATION", "Comissão deve ser entre 0 e 100%");
    }
    commissionBps = Math.round(n * 100);
  }

  const color = raw.color?.trim();
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new AppError("VALIDATION", "Cor inválida (use #RRGGBB)");
  }

  return {
    name,
    nickname: raw.nickname?.trim().slice(0, 80) || undefined,
    phone: raw.phone,
    email: raw.email,
    color: color || undefined,
    isBookable: raw.isBookable,
    commissionBps,
    branchId: raw.branchId?.trim() || undefined,
    avatarUrl:
      raw.avatarUrl === undefined || raw.avatarUrl === null
        ? undefined
        : raw.avatarUrl.trim()
          ? normalizeAvatarUrl(raw.avatarUrl)
          : null,
  };
}

function normalizeAvatarUrl(input: string | null | undefined): string | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  if (s.startsWith("data:image/")) {
    if (s.length > 600_000) {
      throw new AppError("VALIDATION", "Imagem muito grande (máx. ~450 KB)");
    }
    return s;
  }
  if (/^https?:\/\//i.test(s)) return s.slice(0, 2000);
  throw new AppError("VALIDATION", "Foto: use um link https:// ou envie um arquivo de imagem");
}

async function resolveStaffBranchId(explicit?: string | null): Promise<string | null> {
  if (explicit?.trim()) return explicit.trim();
  const branch = await requireBranchContext();
  return branch.id;
}

async function assertBranchBelongsToTenant(branchId: string, tenantId: string) {
  const db = createDb();
  const [row] = await db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(and(eq(schema.branches.id, branchId), eq(schema.branches.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new AppError("VALIDATION", "Unidade inválida");
}

function assertCanWriteAsync() {
  return requireSession().then((session) => {
    requireCapability(session, "staff.write");
    return session;
  });
}

function parseTime(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // <input type="time"> pode mandar HH:MM ou HH:MM:SS
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export async function createStaffMember(raw: StaffInput): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const input = parseStaffInput(raw);
    const db = createDb();
    const { phone } = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    const branchId = await resolveStaffBranchId(input.branchId);
    if (branchId) await assertBranchBelongsToTenant(branchId, tenant.id);

    const [created] = await db
      .insert(schema.staff)
      .values({
        tenantId: tenant.id,
        branchId,
        name: input.name,
        nickname: input.nickname ?? null,
        phone,
        email,
        color: input.color ?? null,
        avatarUrl: input.avatarUrl ?? null,
        defaultCommissionBps: input.commissionBps,
        isBookable: input.isBookable ?? true,
      })
      .returning({ id: schema.staff.id });

    return { ok: true, id: created.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Sem permissão para cadastrar profissionais" };
    }
    console.error("[createStaffMember]", err);
    return { ok: false, error: "Erro ao criar profissional" };
  }
}

export async function updateStaffMember(staffId: string, raw: StaffInput): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const input = parseStaffInput(raw);
    const db = createDb();
    const { phone } = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);

    const [existing] = await db
      .select({ branchId: schema.staff.branchId, avatarUrl: schema.staff.avatarUrl })
      .from(schema.staff)
      .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Profissional não encontrado");
    }

    const branchId =
      input.branchId ?? existing.branchId ?? (await resolveStaffBranchId(null));
    if (branchId) await assertBranchBelongsToTenant(branchId, tenant.id);

    const [updated] = await db
      .update(schema.staff)
      .set({
        name: input.name,
        nickname: input.nickname ?? null,
        phone,
        email,
        color: input.color ?? null,
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        branchId,
        defaultCommissionBps: input.commissionBps,
        isBookable: input.isBookable ?? true,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
      .returning({ id: schema.staff.id });

    if (!updated) {
      throw new NotFoundError("Profissional não encontrado");
    }

    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Sem permissão para editar profissionais" };
    }
    console.error("[updateStaffMember]", err);
    return { ok: false, error: "Erro ao salvar profissional" };
  }
}

export async function saveStaffSchedules(
  staffId: string,
  slots: ScheduleSlotInput[]
): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    await getStaffMember(staffId);
    const db = createDb();

    const valid: ScheduleSlotInput[] = [];
    const incomplete: string[] = [];
    for (const s of slots) {
      const start = parseTime(s.startTime);
      const end = parseTime(s.endTime);
      if (!start && !end) continue;
      if (!start || !end) {
        incomplete.push(`dia ${s.weekday} turno ${s.slotIndex}`);
        continue;
      }
      if (start >= end) {
        throw new AppError("VALIDATION", "Horário de início deve ser antes do fim");
      }
      if (s.weekday < 0 || s.weekday > 6) continue;
      valid.push({
        weekday: s.weekday,
        slotIndex: s.slotIndex,
        startTime: start,
        endTime: end,
      });
    }
    if (incomplete.length) {
      throw new AppError(
        "VALIDATION",
        `Preencha início e fim do turno (${incomplete.slice(0, 3).join(", ")})`
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.staffSchedules)
        .where(
          and(
            eq(schema.staffSchedules.staffId, staffId),
            eq(schema.staffSchedules.tenantId, tenant.id)
          )
        );

      if (valid.length > 0) {
        await tx.insert(schema.staffSchedules).values(
          valid.map((s) => ({
            tenantId: tenant.id,
            staffId,
            weekday: s.weekday,
            slotIndex: s.slotIndex,
            startTime: s.startTime,
            endTime: s.endTime,
            isActive: true,
          }))
        );
      }
    });

    return { ok: true, id: staffId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Sem permissão" };
    }
    console.error("[saveStaffSchedules]", err);
    return { ok: false, error: "Erro ao salvar jornada" };
  }
}

export async function deactivateStaffMember(staffId: string): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const db = createDb();
    const now = new Date();

    const [updated] = await db
      .update(schema.staff)
      .set({ isActive: false, isBookable: false, deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.staff.id, staffId),
          eq(schema.staff.tenantId, tenant.id),
          eq(schema.staff.isActive, true)
        )
      )
      .returning({ id: schema.staff.id });

    if (!updated) {
      await getStaffMember(staffId);
      return { ok: false, error: "Profissional já está inativo" };
    }

    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[deactivateStaffMember]", err);
    return { ok: false, error: "Erro ao inativar profissional" };
  }
}

export async function updateStaffBranch(
  staffId: string,
  branchId: string | null
): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const db = createDb();

    let resolvedBranchId = branchId?.trim() || null;
    if (!resolvedBranchId) {
      resolvedBranchId = (await resolveStaffBranchId(null)) ?? null;
    }
    if (resolvedBranchId) await assertBranchBelongsToTenant(resolvedBranchId, tenant.id);

    const [updated] = await db
      .update(schema.staff)
      .set({ branchId: resolvedBranchId, updatedAt: new Date() })
      .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
      .returning({ id: schema.staff.id });

    if (!updated) {
      throw new NotFoundError("Profissional não encontrado");
    }

    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[updateStaffBranch]", err);
    return { ok: false, error: "Erro ao atualizar unidade" };
  }
}

export async function reactivateStaffMember(staffId: string): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const db = createDb();

    const [updated] = await db
      .update(schema.staff)
      .set({ isActive: true, deletedAt: null, updatedAt: new Date() })
      .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
      .returning({ id: schema.staff.id });

    if (!updated) {
      return { ok: false, error: "Profissional não encontrado" };
    }

    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[reactivateStaffMember]", err);
    return { ok: false, error: "Erro ao reativar profissional" };
  }
}

/** Meta mensal de clientes distintos atendidos (staff.meta.monthlyTargetClients). */
export async function setStaffClientGoal(
  staffId: string,
  monthlyTargetClients: number | null
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "staff.write");
    const tenant = await requireTenantContext();
    await getStaffMember(staffId);
    const db = createDb();

    const [row] = await db
      .select({ meta: schema.staff.meta })
      .from(schema.staff)
      .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
      .limit(1);

    const meta = { ...((row?.meta ?? {}) as Record<string, unknown>) };
    if (monthlyTargetClients != null && monthlyTargetClients > 0) {
      meta.monthlyTargetClients = Math.floor(monthlyTargetClients);
    } else {
      delete meta.monthlyTargetClients;
    }

    const [updated] = await db
      .update(schema.staff)
      .set({ meta, updatedAt: new Date() })
      .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
      .returning({ id: schema.staff.id });

    if (!updated) return { ok: false, error: "Profissional não encontrado" };
    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[setStaffClientGoal]", err);
    return { ok: false, error: "Erro ao salvar meta de clientes" };
  }
}

/**
 * Salva overrides de % por serviço deste profissional.
 * Campo vazio / null → remove override (volta ao % do catálogo).
 */
export async function saveStaffServiceCommissions(
  staffId: string,
  rows: Array<{ serviceId: string; commissionPct: string }>
): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const db = createDb();

    const [exists] = await db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
      .limit(1);
    if (!exists) throw new NotFoundError("Profissional não encontrado");

    const now = new Date();
    for (const row of rows) {
      const serviceId = row.serviceId?.trim();
      if (!serviceId) continue;

      const [svc] = await db
        .select({ id: schema.services.id })
        .from(schema.services)
        .where(
          and(
            eq(schema.services.id, serviceId),
            eq(schema.services.tenantId, tenant.id),
            isNull(schema.services.deletedAt)
          )
        )
        .limit(1);
      if (!svc) continue;

      const raw = row.commissionPct?.trim() ?? "";
      let commissionBps: number | null = null;
      if (raw !== "") {
        const n = Number(raw.replace(",", "."));
        if (Number.isNaN(n) || n < 0 || n > 100) {
          throw new AppError(
            "VALIDATION",
            `Comissão inválida em um serviço (use 0–100% ou deixe vazio)`
          );
        }
        commissionBps = Math.round(n * 100);
      }

      const [link] = await db
        .select({ id: schema.staffServices.id })
        .from(schema.staffServices)
        .where(
          and(
            eq(schema.staffServices.tenantId, tenant.id),
            eq(schema.staffServices.staffId, staffId),
            eq(schema.staffServices.serviceId, serviceId)
          )
        )
        .limit(1);

      if (link) {
        await db
          .update(schema.staffServices)
          .set({ commissionBps, updatedAt: now })
          .where(eq(schema.staffServices.id, link.id));
      } else if (commissionBps != null) {
        await db.insert(schema.staffServices).values({
          tenantId: tenant.id,
          staffId,
          serviceId,
          commissionBps,
        });
      }
    }

    return { ok: true, id: staffId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[saveStaffServiceCommissions]", err);
    return { ok: false, error: "Erro ao salvar comissões por serviço" };
  }
}
