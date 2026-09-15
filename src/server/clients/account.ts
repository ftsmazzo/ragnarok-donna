import { and, desc, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export type ClientAccountLedgerEntry = {
  id: string;
  deltaCents: number;
  balanceAfterCents: number;
  reason: string;
  notes: string | null;
  orderId: string | null;
  createdAt: Date;
};

export type ClientAccountSummary = {
  clientId: string;
  balanceCents: number;
  ledger: ClientAccountLedgerEntry[];
};

const MANUAL_REASONS = new Set(["manual_credit", "manual_debit"]);

export async function getClientAccount(
  clientId: string,
  limit = 40
): Promise<ClientAccountSummary> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [client] = await db
    .select({
      id: schema.clients.id,
      accountBalanceCents: schema.clients.accountBalanceCents,
    })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
    .limit(1);

  if (!client) throw new NotFoundError("Cliente não encontrado");

  const ledger = await db
    .select({
      id: schema.clientAccountLedger.id,
      deltaCents: schema.clientAccountLedger.deltaCents,
      balanceAfterCents: schema.clientAccountLedger.balanceAfterCents,
      reason: schema.clientAccountLedger.reason,
      notes: schema.clientAccountLedger.notes,
      orderId: schema.clientAccountLedger.orderId,
      createdAt: schema.clientAccountLedger.createdAt,
    })
    .from(schema.clientAccountLedger)
    .where(
      and(
        eq(schema.clientAccountLedger.tenantId, tenant.id),
        eq(schema.clientAccountLedger.clientId, clientId)
      )
    )
    .orderBy(desc(schema.clientAccountLedger.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));

  return {
    clientId: client.id,
    balanceCents: client.accountBalanceCents,
    ledger,
  };
}

/** Aplica delta ao saldo e grava extrato. `deltaCents` > 0 crédito, < 0 débito. */
export async function applyClientAccountDelta(input: {
  tenantId: string;
  clientId: string;
  deltaCents: number;
  reason: string;
  notes?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  createdByUserId?: string | null;
}): Promise<{ balanceAfterCents: number; ledgerId: string }> {
  const delta = Math.round(input.deltaCents);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AppError("VALIDATION", "Valor da conta inválido");
  }

  const db = createDb();
  const [client] = await db
    .select({
      id: schema.clients.id,
      accountBalanceCents: schema.clients.accountBalanceCents,
    })
    .from(schema.clients)
    .where(
      and(eq(schema.clients.id, input.clientId), eq(schema.clients.tenantId, input.tenantId))
    )
    .limit(1);

  if (!client) throw new NotFoundError("Cliente não encontrado");

  const balanceAfter = client.accountBalanceCents + delta;

  await db
    .update(schema.clients)
    .set({ accountBalanceCents: balanceAfter, updatedAt: new Date() })
    .where(
      and(eq(schema.clients.id, input.clientId), eq(schema.clients.tenantId, input.tenantId))
    );

  const [row] = await db
    .insert(schema.clientAccountLedger)
    .values({
      tenantId: input.tenantId,
      clientId: input.clientId,
      deltaCents: delta,
      balanceAfterCents: balanceAfter,
      reason: input.reason.slice(0, 64),
      notes: input.notes?.trim() ? input.notes.trim().slice(0, 240) : null,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning({ id: schema.clientAccountLedger.id });

  return { balanceAfterCents: balanceAfter, ledgerId: row.id };
}

export async function postClientAccountManual(input: {
  clientId: string;
  kind: "credit" | "debit";
  amountCents: number;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "clients.write");
    const tenant = await requireTenantContext();

    const amount = Math.round(input.amountCents);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError("VALIDATION", "Informe um valor maior que zero");
    }

    const delta = input.kind === "credit" ? amount : -amount;
    const reason = input.kind === "credit" ? "manual_credit" : "manual_debit";
    if (!MANUAL_REASONS.has(reason)) {
      throw new AppError("VALIDATION", "Tipo inválido");
    }

    const result = await applyClientAccountDelta({
      tenantId: tenant.id,
      clientId: input.clientId,
      deltaCents: delta,
      reason,
      notes: input.notes,
      createdByUserId: session.user.id,
    });

    return { ok: true, id: result.ledgerId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível lançar na conta do cliente" };
  }
}
