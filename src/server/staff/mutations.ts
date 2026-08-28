import { and, eq } from "drizzle-orm";
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
  if (!/^\d{2}:\d{2}$/.test(v)) return null;
  const [h, m] = v.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return v;
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
    for (const s of slots) {
      const start = parseTime(s.startTime);
      const end = parseTime(s.endTime);
      if (!start || !end) continue;
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

    await db
      .delete(schema.staffSchedules)
      .where(
        and(
          eq(schema.staffSchedules.staffId, staffId),
          eq(schema.staffSchedules.tenantId, tenant.id)
        )
      );

    if (valid.length > 0) {
      await db.insert(schema.staffSchedules).values(
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
