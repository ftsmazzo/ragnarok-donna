import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireRole, requireSession, requireTenantContext } from "../context/tenant";
import { getClient } from "./queries";
import { normalizeEmail, normalizeName, normalizePhone } from "./normalize";

export type ClientInput = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  birthDate?: string;
};

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

function parseInput(raw: ClientInput): ClientInput {
  const name = normalizeName(raw.name);
  if (!name || name.length < 2) {
    throw new AppError("VALIDATION", "Nome deve ter ao menos 2 caracteres");
  }
  return {
    name,
    phone: raw.phone,
    email: raw.email,
    notes: raw.notes?.trim().slice(0, 2000) || undefined,
    birthDate: raw.birthDate?.trim() || undefined,
  };
}

function assertCanWriteAsync() {
  return requireSession().then((session) => {
    requireRole(session, ["owner", "admin", "manager"]);
    return session;
  });
}

export async function createClient(raw: ClientInput): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const input = parseInput(raw);
    const db = createDb();
    const { phone, phoneE164 } = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);

    const [created] = await db
      .insert(schema.clients)
      .values({
        tenantId: tenant.id,
        name: input.name,
        phone,
        phoneE164,
        email,
        notes: input.notes ?? null,
        birthDate: input.birthDate || null,
      })
      .returning({ id: schema.clients.id });

    return { ok: true, id: created.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Sem permissão para cadastrar clientes" };
    }
    console.error("[createClient]", err);
    return { ok: false, error: "Erro ao criar cliente" };
  }
}

export async function updateClient(clientId: string, raw: ClientInput): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const input = parseInput(raw);
    const db = createDb();
    const { phone, phoneE164 } = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);

    const [updated] = await db
      .update(schema.clients)
      .set({
        name: input.name,
        phone,
        phoneE164,
        email,
        notes: input.notes ?? null,
        birthDate: input.birthDate || null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
      .returning({ id: schema.clients.id });

    if (!updated) {
      throw new NotFoundError("Cliente não encontrado");
    }

    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Sem permissão para editar clientes" };
    }
    console.error("[updateClient]", err);
    return { ok: false, error: "Erro ao salvar cliente" };
  }
}

export async function deactivateClient(clientId: string): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const db = createDb();
    const now = new Date();

    const [updated] = await db
      .update(schema.clients)
      .set({ isActive: false, deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.clients.id, clientId),
          eq(schema.clients.tenantId, tenant.id),
          eq(schema.clients.isActive, true)
        )
      )
      .returning({ id: schema.clients.id });

    if (!updated) {
      await getClient(clientId);
      return { ok: false, error: "Cliente já está inativo" };
    }

    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Sem permissão" };
    }
    console.error("[deactivateClient]", err);
    return { ok: false, error: "Erro ao inativar cliente" };
  }
}

export async function reactivateClient(clientId: string): Promise<ActionResult> {
  try {
    await assertCanWriteAsync();
    const tenant = await requireTenantContext();
    const db = createDb();

    const [updated] = await db
      .update(schema.clients)
      .set({ isActive: true, deletedAt: null, updatedAt: new Date() })
      .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
      .returning({ id: schema.clients.id });

    if (!updated) {
      return { ok: false, error: "Cliente não encontrado" };
    }

    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Sem permissão" };
    }
    console.error("[reactivateClient]", err);
    return { ok: false, error: "Erro ao reativar cliente" };
  }
}
