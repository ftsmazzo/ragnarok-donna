import { and, count, desc, eq, sql } from "drizzle-orm";
import { createDb, schema, type DbTransaction } from "@/db";
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
  ledgerTotal: number;
  ledgerPage: number;
  ledgerPageSize: number;
};

const MANUAL_REASONS = new Set(["manual_credit", "manual_debit"]);
const SETTLE_METHODS = new Set([
  "cash",
  "pix",
  "pix_key",
  "debit",
  "credit",
  "transfer",
  "rede_link",
  "infinity",
  "other",
]);

export async function getClientAccount(
  clientId: string,
  opts?: { limit?: number; page?: number }
): Promise<ClientAccountSummary> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, opts?.limit ?? 40));

  const [client] = await db
    .select({
      id: schema.clients.id,
      accountBalanceCents: schema.clients.accountBalanceCents,
    })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
    .limit(1);

  if (!client) throw new NotFoundError("Cliente não encontrado");

  const ledgerWhere = and(
    eq(schema.clientAccountLedger.tenantId, tenant.id),
    eq(schema.clientAccountLedger.clientId, clientId)
  );

  const [totalRow] = await db
    .select({ n: count() })
    .from(schema.clientAccountLedger)
    .where(ledgerWhere);

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
    .where(ledgerWhere)
    .orderBy(desc(schema.clientAccountLedger.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    clientId: client.id,
    balanceCents: client.accountBalanceCents,
    ledger,
    ledgerTotal: Number(totalRow?.n ?? 0),
    ledgerPage: page,
    ledgerPageSize: pageSize,
  };
}

/** Aplica delta ao saldo e grava extrato. `deltaCents` > 0 crédito, < 0 débito. */
export type ClientAccountDeltaInput = {
  tenantId: string;
  clientId: string;
  deltaCents: number;
  reason: string;
  notes?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  createdByUserId?: string | null;
};

/** Use dentro da mesma transação da operação financeira que originou o delta. */
export async function applyClientAccountDeltaTx(
  tx: DbTransaction,
  input: ClientAccountDeltaInput
): Promise<{ balanceAfterCents: number; ledgerId: string }> {
  const delta = Math.round(input.deltaCents);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AppError("VALIDATION", "Valor da conta inválido");
  }

  const [client] = await tx
    .update(schema.clients)
    .set({
      accountBalanceCents: sql`${schema.clients.accountBalanceCents} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.clients.id, input.clientId), eq(schema.clients.tenantId, input.tenantId))
    )
    .returning({
      id: schema.clients.id,
      accountBalanceCents: schema.clients.accountBalanceCents,
    });

  if (!client) throw new NotFoundError("Cliente não encontrado");

  const [row] = await tx
    .insert(schema.clientAccountLedger)
    .values({
      tenantId: input.tenantId,
      clientId: input.clientId,
      deltaCents: delta,
      balanceAfterCents: client.accountBalanceCents,
      reason: input.reason.slice(0, 64),
      notes: input.notes?.trim() ? input.notes.trim().slice(0, 240) : null,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning({ id: schema.clientAccountLedger.id });

  return { balanceAfterCents: client.accountBalanceCents, ledgerId: row.id };
}

/** Operação autônoma: saldo e extrato sempre confirmam ou revertem juntos. */
export async function applyClientAccountDelta(
  input: ClientAccountDeltaInput
): Promise<{ balanceAfterCents: number; ledgerId: string }> {
  const db = createDb();
  return db.transaction((tx) => applyClientAccountDeltaTx(tx, input));
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

/**
 * Recebe pagamento de fiado: abate saldo negativo e registra entrada no caixa (se aberto).
 */
export async function settleClientAccountDebt(input: {
  clientId: string;
  amountCents: number;
  method: string;
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
    if (!SETTLE_METHODS.has(input.method)) {
      throw new AppError("VALIDATION", "Forma de pagamento inválida");
    }

    const db = createDb();
    const ledgerId = await db.transaction(async (tx) => {
      const [client] = await tx
        .select({
          id: schema.clients.id,
          accountBalanceCents: schema.clients.accountBalanceCents,
        })
        .from(schema.clients)
        .where(
          and(eq(schema.clients.id, input.clientId), eq(schema.clients.tenantId, tenant.id))
        )
        .for("update");

      if (!client) throw new NotFoundError("Cliente não encontrado");
      if (client.accountBalanceCents >= 0) {
        throw new AppError("VALIDATION", "Cliente não possui fiado em aberto");
      }

      const debt = Math.abs(client.accountBalanceCents);
      if (amount > debt) {
        const max = (debt / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        throw new AppError("VALIDATION", `Valor acima do fiado (máx. ${max})`);
      }

      const applied = await applyClientAccountDeltaTx(tx, {
        tenantId: tenant.id,
        clientId: input.clientId,
        deltaCents: amount,
        reason: "debt_settlement",
        notes: input.notes?.trim()
          ? input.notes.trim().slice(0, 240)
          : `Recebimento de fiado (${input.method})`,
        createdByUserId: session.user.id,
      });

      const { recordPaymentInCashTx } = await import("../finance/mutations");
      await recordPaymentInCashTx(tx, {
        tenantId: tenant.id,
        orderId: null,
        method: input.method as
          | "cash"
          | "pix"
          | "pix_key"
          | "debit"
          | "credit"
          | "transfer"
          | "rede_link"
          | "infinity"
          | "other",
        amountCents: amount,
        description: "Recebimento de fiado — Conta do Cliente",
      });

      return applied.ledgerId;
    });

    return { ok: true, id: ledgerId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível receber o fiado" };
  }
}
