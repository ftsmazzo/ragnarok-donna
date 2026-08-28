import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { generateTempPassword } from "../auth/generate-password";
import { hashPassword } from "../auth/password";
import { AppError, ForbiddenError } from "../errors";
import { sendMemberInviteEmail } from "../mail/invite";
import { sendMemberInviteWhatsApp } from "../mail/invite-whatsapp";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { roleRequiresBranch } from "../permissions/roles";
import type { MemberRole } from "../types";
import { getStaffForProvisioning } from "./queries";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type InviteMemberResult =
  | {
      ok: true;
      email: string;
      tempPassword?: string;
      emailSent?: boolean;
      emailError?: string;
      whatsappSent?: boolean;
      whatsappError?: string;
    }
  | { ok: false; error: string };

const ASSIGNABLE: MemberRole[] = ["owner", "admin", "manager", "staff", "readonly"];

export type InviteMemberInput = {
  name?: string;
  email?: string;
  password?: string;
  role: MemberRole;
  branchId?: string | null;
  staffId?: string | null;
  sendInviteEmail?: boolean;
};

async function loadStaffRecord(tenantId: string, staffId: string) {
  const db = createDb();
  const [staff] = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      email: schema.staff.email,
      branchId: schema.staff.branchId,
      userId: schema.staff.userId,
    })
    .from(schema.staff)
    .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenantId)))
    .limit(1);

  if (!staff) throw new AppError("NOT_FOUND", "Profissional não encontrado");
  if (staff.userId) {
    throw new AppError("VALIDATION", "Profissional já possui acesso vinculado");
  }
  return staff;
}

async function createMemberAccess(input: {
  name: string;
  email: string;
  password: string;
  role: MemberRole;
  branchId: string | null;
  staffId?: string | null;
  staffPhone?: string | null;
  sendInviteEmail?: boolean;
  sendInviteWhatsApp?: boolean;
}): Promise<InviteMemberResult> {
  const session = await requireSession();
  requireCapability(session, "members.manage");
  const tenant = await requireTenantContext();
  const db = createDb();

  const passwordHash = await hashPassword(input.password);

  const [user] = await db
    .insert(schema.users)
    .values({ name: input.name, email: input.email, passwordHash })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { name: input.name, passwordHash, updatedAt: new Date() },
    })
    .returning({ id: schema.users.id });

  await db
    .insert(schema.memberships)
    .values({
      tenantId: tenant.id,
      userId: user.id,
      role: input.role,
      branchId: input.branchId,
    })
    .onConflictDoUpdate({
      target: [schema.memberships.tenantId, schema.memberships.userId],
      set: { role: input.role, branchId: input.branchId, updatedAt: new Date() },
    });

  if (input.role === "staff" && input.staffId) {
    const [member] = await db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        and(eq(schema.memberships.tenantId, tenant.id), eq(schema.memberships.userId, user.id))
      )
      .limit(1);
    if (member) {
      await linkStaffToUser(member.id, input.staffId);
    }
  }

  let emailSent = false;
  let emailError: string | undefined;
  if (input.sendInviteEmail) {
    const mail = await sendMemberInviteEmail({
      to: input.email,
      name: input.name,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tempPassword: input.password,
    });
    emailSent = mail.sent;
    emailError = mail.error;
  }

  let whatsappSent = false;
  let whatsappError: string | undefined;
  if (input.sendInviteWhatsApp && input.staffPhone) {
    const wa = await sendMemberInviteWhatsApp({
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      name: input.name,
      phone: input.staffPhone,
      email: input.email,
      tempPassword: input.password,
    });
    whatsappSent = wa.sent;
    whatsappError = wa.error;
  }

  const hidePassword = (input.sendInviteEmail && emailSent) || whatsappSent;

  return {
    ok: true,
    email: input.email,
    tempPassword: hidePassword ? undefined : input.password,
    emailSent,
    emailError,
    whatsappSent,
    whatsappError,
  };
}

export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "members.manage");

    if (!ASSIGNABLE.includes(input.role)) {
      throw new AppError("VALIDATION", "Papel inválido");
    }
    if (input.role === "owner" && session.role !== "owner") {
      throw new ForbiddenError("Somente donos podem criar outro dono");
    }
    if (input.role === "staff" && !input.staffId) {
      throw new AppError("VALIDATION", "Selecione o profissional importado");
    }

    const tenant = await requireTenantContext();

    let name = input.name?.trim() ?? "";
    let email = input.email?.trim().toLowerCase() ?? "";
    let branchId = input.branchId ?? null;
    let password = input.password?.trim() ?? "";

    if (input.role === "staff" && input.staffId) {
      const staff = await loadStaffRecord(tenant.id, input.staffId);
      name = name || staff.name;
      email = email || staff.email?.trim().toLowerCase() || "";
      branchId = staff.branchId ?? branchId;
    }

    if (!name || !email) {
      throw new AppError(
        "VALIDATION",
        "Nome e e-mail são obrigatórios. Cadastre o e-mail do profissional em Profissionais ou informe aqui."
      );
    }

    if (!password) {
      password = generateTempPassword();
    } else if (password.length < 8) {
      throw new AppError("VALIDATION", "Senha deve ter no mínimo 8 caracteres");
    }

    if (roleRequiresBranch(input.role) && !branchId) {
      throw new AppError("VALIDATION", "Gerente e profissional precisam de uma unidade");
    }
    if (input.role === "owner" || input.role === "admin") {
      branchId = null;
    }

    if (branchId) {
      const db = createDb();
      const [branch] = await db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(and(eq(schema.branches.id, branchId), eq(schema.branches.tenantId, tenant.id)))
        .limit(1);
      if (!branch) {
        throw new AppError("VALIDATION", "Unidade inválida");
      }
    }

    return createMemberAccess({
      name,
      email,
      password,
      role: input.role,
      branchId,
      staffId: input.staffId,
      sendInviteEmail: input.sendInviteEmail ?? false,
    });
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível criar o usuário" };
  }
}

export type ProvisionStaffInput = {
  staffId: string;
  password?: string;
  email?: string;
  sendInviteEmail?: boolean;
  sendInviteWhatsApp?: boolean;
};

/** Cria login de barbeiro a partir do cadastro importado (nome, e-mail, unidade, vínculo). */
export async function provisionStaffAccess(input: ProvisionStaffInput): Promise<InviteMemberResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "members.manage");
    const tenant = await requireTenantContext();

    const staff = await getStaffForProvisioning(input.staffId);
    if (!staff) {
      throw new AppError("NOT_FOUND", "Profissional não encontrado ou já possui acesso");
    }

    const email = (input.email?.trim().toLowerCase() || staff.email?.trim().toLowerCase() || "").trim();
    if (!email) {
      throw new AppError(
        "VALIDATION",
        `${staff.name} não tem e-mail no cadastro. Informe o e-mail ou cadastre em Profissionais.`
      );
    }

    let password = input.password?.trim() ?? "";
    if (!password) password = generateTempPassword();
    else if (password.length < 8) {
      throw new AppError("VALIDATION", "Senha deve ter no mínimo 8 caracteres");
    }

    if (!staff.branchId) {
      throw new AppError("VALIDATION", `${staff.name} não está vinculado a uma unidade`);
    }

    return createMemberAccess({
      name: staff.name,
      email,
      password,
      role: "staff",
      branchId: staff.branchId,
      staffId: staff.id,
      staffPhone: staff.phone,
      sendInviteEmail: input.sendInviteEmail ?? true,
      sendInviteWhatsApp: input.sendInviteWhatsApp ?? true,
    });
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível criar o acesso" };
  }
}

export type BulkProvisionResult =
  | {
      ok: true;
      created: number;
      skipped: { name: string; reason: string }[];
      results: InviteMemberResult[];
    }
  | { ok: false; error: string };

export async function bulkProvisionStaffAccess(opts?: {
  sendInviteEmail?: boolean;
  sendInviteWhatsApp?: boolean;
}): Promise<BulkProvisionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "members.manage");
    const tenant = await requireTenantContext();
    const db = createDb();

    const staffRows = await db
      .select({
        id: schema.staff.id,
        name: schema.staff.name,
        email: schema.staff.email,
        branchId: schema.staff.branchId,
      })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.tenantId, tenant.id),
          eq(schema.staff.isActive, true),
          isNull(schema.staff.userId),
          isNull(schema.staff.deletedAt)
        )
      );

    const skipped: { name: string; reason: string }[] = [];
    const results: InviteMemberResult[] = [];
    let created = 0;

    for (const staff of staffRows) {
      if (!staff.email?.trim()) {
        skipped.push({ name: staff.name, reason: "Sem e-mail no cadastro" });
        continue;
      }
      if (!staff.branchId) {
        skipped.push({ name: staff.name, reason: "Sem unidade vinculada" });
        continue;
      }

      const result = await provisionStaffAccess({
        staffId: staff.id,
        sendInviteEmail: opts?.sendInviteEmail ?? true,
        sendInviteWhatsApp: opts?.sendInviteWhatsApp ?? true,
      });
      results.push(result);
      if (result.ok) created++;
      else skipped.push({ name: staff.name, reason: result.error });
    }

    return { ok: true, created, skipped, results };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível provisionar a equipe" };
  }
}

export async function updateMemberBranch(
  membershipId: string,
  branchId: string | null
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "members.manage");
    const tenant = await requireTenantContext();
    const db = createDb();

    const [target] = await db
      .select({ id: schema.memberships.id, role: schema.memberships.role })
      .from(schema.memberships)
      .where(
        and(eq(schema.memberships.id, membershipId), eq(schema.memberships.tenantId, tenant.id))
      )
      .limit(1);

    if (!target) throw new AppError("NOT_FOUND", "Membro não encontrado");

    if (roleRequiresBranch(target.role) && !branchId) {
      throw new AppError("VALIDATION", "Este papel exige uma unidade");
    }

    if (branchId) {
      const [branch] = await db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(and(eq(schema.branches.id, branchId), eq(schema.branches.tenantId, tenant.id)))
        .limit(1);
      if (!branch) throw new AppError("VALIDATION", "Unidade inválida");
    }

    await db
      .update(schema.memberships)
      .set({
        branchId: roleRequiresBranch(target.role) || target.role === "readonly" ? branchId : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.memberships.id, membershipId));

    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível atualizar a unidade" };
  }
}

export async function updateMemberRole(
  membershipId: string,
  role: MemberRole
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "members.manage");

    if (!ASSIGNABLE.includes(role)) {
      throw new AppError("VALIDATION", "Papel inválido");
    }

    const tenant = await requireTenantContext();
    const db = createDb();

    const [target] = await db
      .select({
        id: schema.memberships.id,
        userId: schema.memberships.userId,
        role: schema.memberships.role,
      })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.id, membershipId),
          eq(schema.memberships.tenantId, tenant.id)
        )
      )
      .limit(1);

    if (!target) {
      throw new AppError("NOT_FOUND", "Membro não encontrado");
    }

    if (target.role === "owner" && role !== "owner") {
      const owners = await db
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.tenantId, tenant.id),
            eq(schema.memberships.role, "owner")
          )
        );
      if (owners.length <= 1) {
        throw new AppError("VALIDATION", "Não é possível rebaixar o único dono da unidade");
      }
    }

    await db
      .update(schema.memberships)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.memberships.id, membershipId));

    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível atualizar o papel" };
  }
}

export async function linkStaffToUser(
  membershipId: string,
  staffId: string | null
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "members.manage");
    const tenant = await requireTenantContext();
    const db = createDb();

    const [member] = await db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.id, membershipId),
          eq(schema.memberships.tenantId, tenant.id)
        )
      )
      .limit(1);

    if (!member) {
      throw new AppError("NOT_FOUND", "Membro não encontrado");
    }

    if (staffId) {
      const [staff] = await db
        .select({ id: schema.staff.id, userId: schema.staff.userId })
        .from(schema.staff)
        .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenant.id)))
        .limit(1);

      if (!staff) {
        throw new AppError("NOT_FOUND", "Profissional não encontrado");
      }

      if (staff.userId && staff.userId !== member.userId) {
        throw new AppError("VALIDATION", "Profissional já vinculado a outro usuário");
      }

      await db
        .update(schema.staff)
        .set({ userId: null, updatedAt: new Date() })
        .where(
          and(eq(schema.staff.tenantId, tenant.id), eq(schema.staff.userId, member.userId))
        );

      await db
        .update(schema.staff)
        .set({ userId: member.userId, updatedAt: new Date() })
        .where(eq(schema.staff.id, staffId));
    } else {
      await db
        .update(schema.staff)
        .set({ userId: null, updatedAt: new Date() })
        .where(
          and(eq(schema.staff.tenantId, tenant.id), eq(schema.staff.userId, member.userId))
        );
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível vincular o profissional" };
  }
}
