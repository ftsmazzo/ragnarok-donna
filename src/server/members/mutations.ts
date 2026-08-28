import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { hashPassword } from "../auth/password";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { roleRequiresBranch } from "../permissions/roles";
import type { MemberRole } from "../types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ASSIGNABLE: MemberRole[] = ["owner", "admin", "manager", "staff", "readonly"];

export type InviteMemberInput = {
  name: string;
  email: string;
  password: string;
  role: MemberRole;
  branchId?: string | null;
  staffId?: string | null;
};

export async function inviteMember(input: InviteMemberInput): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "members.manage");

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    if (!name || !email || !password) {
      throw new AppError("VALIDATION", "Nome, e-mail e senha são obrigatórios");
    }
    if (password.length < 8) {
      throw new AppError("VALIDATION", "Senha deve ter no mínimo 8 caracteres");
    }
    if (!ASSIGNABLE.includes(input.role)) {
      throw new AppError("VALIDATION", "Papel inválido");
    }
    if (input.role === "owner" && session.role !== "owner") {
      throw new ForbiddenError("Somente donos podem criar outro dono");
    }

    const tenant = await requireTenantContext();
    const db = createDb();

    let branchId = input.branchId ?? null;
    if (roleRequiresBranch(input.role) && !branchId) {
      throw new AppError("VALIDATION", "Gerente e profissional precisam de uma unidade");
    }
    if (input.role === "owner" || input.role === "admin") {
      branchId = null;
    }

    if (branchId) {
      const [branch] = await db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(and(eq(schema.branches.id, branchId), eq(schema.branches.tenantId, tenant.id)))
        .limit(1);
      if (!branch) {
        throw new AppError("VALIDATION", "Unidade inválida");
      }
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(schema.users)
      .values({ name, email, passwordHash })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: { name, passwordHash, updatedAt: new Date() },
      })
      .returning({ id: schema.users.id });

    await db
      .insert(schema.memberships)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        role: input.role,
        branchId,
      })
      .onConflictDoUpdate({
        target: [schema.memberships.tenantId, schema.memberships.userId],
        set: { role: input.role, branchId, updatedAt: new Date() },
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

    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível criar o usuário" };
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
      .set({ branchId: roleRequiresBranch(target.role) || target.role === "readonly" ? branchId : null, updatedAt: new Date() })
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
