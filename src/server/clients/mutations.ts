import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireCapability } from "../permissions/guards";
import { requireSession, requireTenantContext } from "../context/tenant";
import { getClient } from "./queries";
import { normalizeEmail, normalizeName, normalizePhone } from "./normalize";

export type ClientInput = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  birthDate?: string;
  howHeard?: string;
  referredBy?: string;
  campaign?: string;
  hairPreference?: string;
  avatarUrl?: string | null;
  crmStatus?: string;
  marketingOptIn?: boolean;
};

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

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
    howHeard: raw.howHeard?.trim().slice(0, 80) || undefined,
    referredBy: raw.referredBy?.trim().slice(0, 160) || undefined,
    campaign: raw.campaign?.trim().slice(0, 120) || undefined,
    hairPreference: raw.hairPreference?.trim().slice(0, 120) || undefined,
    crmStatus: raw.crmStatus?.trim().slice(0, 40) || undefined,
    marketingOptIn: raw.marketingOptIn,
    avatarUrl:
      raw.avatarUrl === undefined || raw.avatarUrl === null
        ? undefined
        : raw.avatarUrl.trim()
          ? normalizeAvatarUrl(raw.avatarUrl)
          : null,
  };
}

function crmPreferences(input: ClientInput, existing?: Record<string, unknown>) {
  const next = { ...(existing ?? {}) };
  if (input.howHeard) next.howHeard = input.howHeard;
  else delete next.howHeard;
  if (input.referredBy) next.referredBy = input.referredBy;
  else delete next.referredBy;
  if (input.campaign) next.campaign = input.campaign;
  else delete next.campaign;
  if (input.hairPreference) next.hairPreference = input.hairPreference;
  else delete next.hairPreference;
  if (input.crmStatus) next.crmStatus = input.crmStatus;
  else if (!next.crmStatus) next.crmStatus = "client";
  if (input.marketingOptIn === true) next.marketingOptIn = true;
  else if (input.marketingOptIn === false) delete next.marketingOptIn;
  if (!next.crmStage && next.crmStatus === "lead") next.crmStage = "interessado";
  return next;
}

function assertCanWriteAsync() {
  return requireSession().then((session) => {
    requireCapability(session, "clients.write");
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
        avatarUrl: input.avatarUrl ?? null,
        preferences: crmPreferences(input),
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

    const [existing] = await db
      .select({ preferences: schema.clients.preferences })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
      .limit(1);

    const [updated] = await db
      .update(schema.clients)
      .set({
        name: input.name,
        phone,
        phoneE164,
        email,
        notes: input.notes ?? null,
        birthDate: input.birthDate || null,
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        preferences: crmPreferences(input, existing?.preferences ?? {}),
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
