import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError } from "../errors";
import { requireSession } from "../context/tenant";
import type { ActionResult } from "../members/mutations";
import { hashPassword, verifyPassword } from "./password";

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const current = input.currentPassword.trim();
    const next = input.newPassword.trim();

    if (!current || !next) {
      throw new AppError("VALIDATION", "Preencha a senha atual e a nova senha");
    }
    if (next.length < 8) {
      throw new AppError("VALIDATION", "A nova senha deve ter pelo menos 8 caracteres");
    }
    if (next === current) {
      throw new AppError("VALIDATION", "A nova senha deve ser diferente da atual");
    }

    const db = createDb();
    const [user] = await db
      .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(and(eq(schema.users.id, session.user.id), isNull(schema.users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new AppError("NOT_FOUND", "Usuário não encontrado");
    }

    const ok = await verifyPassword(current, user.passwordHash);
    if (!ok) {
      throw new AppError("VALIDATION", "Senha atual incorreta");
    }

    const passwordHash = await hashPassword(next);
    await db
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível alterar a senha" };
  }
}
