import { and, desc, eq, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireCapability } from "../permissions/guards";
import { requireSession, requireTenantContext } from "../context/tenant";

export type SubscriptionStatus = "active" | "late" | "cancelled";

export type ClientSubscriptionRow = {
  id: string;
  clientId: string;
  clientName: string;
  phone: string | null;
  name: string;
  priceCents: number;
  status: SubscriptionStatus;
  startedAt: Date;
  currentPeriodEnd: Date;
  notes: string | null;
  cancelledAt: Date | null;
};

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

function effectiveStatus(
  status: string,
  currentPeriodEnd: Date,
  cancelledAt: Date | null
): SubscriptionStatus {
  if (status === "cancelled" || cancelledAt) return "cancelled";
  if (currentPeriodEnd.getTime() < Date.now()) return "late";
  if (status === "late") return "late";
  return "active";
}

export { labelSubscriptionStatus } from "@/lib/subscriptions";

export async function listClientSubscriptions(clientId: string): Promise<ClientSubscriptionRow[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const rows = await db
    .select({
      id: schema.clientSubscriptions.id,
      clientId: schema.clientSubscriptions.clientId,
      clientName: schema.clients.name,
      phone: schema.clients.phone,
      name: schema.clientSubscriptions.name,
      priceCents: schema.clientSubscriptions.priceCents,
      status: schema.clientSubscriptions.status,
      startedAt: schema.clientSubscriptions.startedAt,
      currentPeriodEnd: schema.clientSubscriptions.currentPeriodEnd,
      notes: schema.clientSubscriptions.notes,
      cancelledAt: schema.clientSubscriptions.cancelledAt,
    })
    .from(schema.clientSubscriptions)
    .innerJoin(schema.clients, eq(schema.clientSubscriptions.clientId, schema.clients.id))
    .where(
      and(
        eq(schema.clientSubscriptions.tenantId, tenant.id),
        eq(schema.clientSubscriptions.clientId, clientId)
      )
    )
    .orderBy(desc(schema.clientSubscriptions.startedAt));

  return rows.map((r) => ({
    ...r,
    status: effectiveStatus(r.status, r.currentPeriodEnd, r.cancelledAt),
  }));
}

export async function listSubscriptions(opts?: {
  status?: string;
  limit?: number;
}): Promise<ClientSubscriptionRow[]> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 300);

  const rows = await db
    .select({
      id: schema.clientSubscriptions.id,
      clientId: schema.clientSubscriptions.clientId,
      clientName: schema.clients.name,
      phone: schema.clients.phone,
      name: schema.clientSubscriptions.name,
      priceCents: schema.clientSubscriptions.priceCents,
      status: schema.clientSubscriptions.status,
      startedAt: schema.clientSubscriptions.startedAt,
      currentPeriodEnd: schema.clientSubscriptions.currentPeriodEnd,
      notes: schema.clientSubscriptions.notes,
      cancelledAt: schema.clientSubscriptions.cancelledAt,
    })
    .from(schema.clientSubscriptions)
    .innerJoin(schema.clients, eq(schema.clientSubscriptions.clientId, schema.clients.id))
    .where(eq(schema.clientSubscriptions.tenantId, tenant.id))
    .orderBy(desc(schema.clientSubscriptions.updatedAt))
    .limit(limit);

  const mapped = rows.map((r) => ({
    ...r,
    status: effectiveStatus(r.status, r.currentPeriodEnd, r.cancelledAt),
  }));

  const filter = opts?.status?.trim();
  if (filter && filter !== "all") {
    return mapped.filter((r) => r.status === filter);
  }
  return mapped;
}

export async function createClientSubscription(input: {
  clientId: string;
  name: string;
  priceCents: number;
  periodDays?: number;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "clients.write");
    const tenant = await requireTenantContext();
    const name = input.name.trim().slice(0, 160);
    if (name.length < 2) throw new AppError("VALIDATION", "Informe o nome do plano");
    const priceCents = Math.max(0, Math.floor(Number(input.priceCents) || 0));
    const periodDays = Math.min(Math.max(input.periodDays ?? 30, 7), 366);
    const notes = input.notes?.trim().slice(0, 500) || null;

    const db = createDb();
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(
        and(eq(schema.clients.id, input.clientId), eq(schema.clients.tenantId, tenant.id))
      )
      .limit(1);
    if (!client) throw new NotFoundError("Cliente não encontrado");

    const startedAt = new Date();
    const currentPeriodEnd = new Date(startedAt.getTime() + periodDays * 86_400_000);

    const [created] = await db
      .insert(schema.clientSubscriptions)
      .values({
        tenantId: tenant.id,
        clientId: input.clientId,
        name,
        priceCents,
        status: "active",
        startedAt,
        currentPeriodEnd,
        notes,
      })
      .returning({ id: schema.clientSubscriptions.id });

    return { ok: true, id: created.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[createClientSubscription]", err);
    return { ok: false, error: "Erro ao criar assinatura" };
  }
}

export async function renewClientSubscription(subscriptionId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "clients.write");
    const tenant = await requireTenantContext();
    const db = createDb();

    const [row] = await db
      .select()
      .from(schema.clientSubscriptions)
      .where(
        and(
          eq(schema.clientSubscriptions.id, subscriptionId),
          eq(schema.clientSubscriptions.tenantId, tenant.id)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError("Assinatura não encontrada");
    if (row.status === "cancelled" || row.cancelledAt) {
      return { ok: false, error: "Assinatura cancelada — crie uma nova" };
    }

    const base =
      row.currentPeriodEnd.getTime() > Date.now()
        ? row.currentPeriodEnd
        : new Date();
    const currentPeriodEnd = new Date(base.getTime() + 30 * 86_400_000);

    await db
      .update(schema.clientSubscriptions)
      .set({
        status: "active",
        currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(schema.clientSubscriptions.id, subscriptionId));

    return { ok: true, id: subscriptionId };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[renewClientSubscription]", err);
    return { ok: false, error: "Erro ao renovar" };
  }
}

export async function cancelClientSubscription(subscriptionId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "clients.write");
    const tenant = await requireTenantContext();
    const db = createDb();
    const now = new Date();

    const [updated] = await db
      .update(schema.clientSubscriptions)
      .set({
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.clientSubscriptions.id, subscriptionId),
          eq(schema.clientSubscriptions.tenantId, tenant.id),
          sql`${schema.clientSubscriptions.cancelledAt} is null`
        )
      )
      .returning({ id: schema.clientSubscriptions.id });

    if (!updated) return { ok: false, error: "Assinatura já cancelada ou inexistente" };
    return { ok: true, id: updated.id };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[cancelClientSubscription]", err);
    return { ok: false, error: "Erro ao cancelar" };
  }
}
