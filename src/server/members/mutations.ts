import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import type { MemberRole } from "../types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ASSIGNABLE: MemberRole[] = ["owner", "admin", "manager", "staff", "readonly"];

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
