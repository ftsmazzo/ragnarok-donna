import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import type { AppSession } from "../types";
import { requireTenantContext } from "../context/tenant";
import { isBarberRole } from "./roles";

/** Profissional vinculado ao usuário logado (barbeiro). */
export async function getStaffIdForUser(
  tenantId: string,
  userId: string
): Promise<string | null> {
  const db = createDb();
  const [row] = await db
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, tenantId),
        eq(schema.staff.userId, userId),
        isNull(schema.staff.deletedAt)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

export async function resolveSessionStaffId(session: AppSession): Promise<string | null> {
  if (session.staffId) return session.staffId;
  if (!isBarberRole(session.role)) return null;
  return getStaffIdForUser(session.tenant.id, session.user.id);
}

/** Garante que barbeiro só acessa o próprio staffId. */
export async function assertOwnStaffAccess(
  session: AppSession,
  targetStaffId: string
): Promise<void> {
  if (!isBarberRole(session.role)) return;
  const ownId = await resolveSessionStaffId(session);
  if (!ownId || ownId !== targetStaffId) {
    const { ForbiddenError } = await import("../errors");
    throw new ForbiddenError("Acesso restrito ao seu perfil profissional");
  }
}

export async function requireOwnStaffId(session: AppSession): Promise<string> {
  const ownId = await resolveSessionStaffId(session);
  if (!ownId) {
    const { ForbiddenError } = await import("../errors");
    throw new ForbiddenError(
      "Conta não vinculada a um profissional. Peça ao dono para vincular em Configurações → Equipe."
    );
  }
  return ownId;
}
