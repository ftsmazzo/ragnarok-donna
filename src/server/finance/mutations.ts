import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema, type DbTransaction } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { findOpenCashSessionId } from "./queries";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const PAYMENT_METHODS = [
  "cash",
  "pix",
  "pix_key",
  "debit",
  "credit",
  "transfer",
  "rede_link",
  "infinity",
  "client_account",
  "other",
] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export async function openCashSession(input: {
  openingCents?: number;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "cash.write");
    const tenant = await requireTenantContext();

    const existing = await findOpenCashSessionId(tenant.id);
    if (existing) {
      throw new AppError("VALIDATION", "Já existe um caixa aberto nesta unidade");
    }

    const openingCents = Math.max(0, Math.round(input.openingCents ?? 0));
    const db = createDb();
    const [row] = await db
      .insert(schema.cashSessions)
      .values({
        tenantId: tenant.id,
        openedByUserId: session.user.id,
        openingCents,
        notes: input.notes?.trim() || null,
      })
      .returning({ id: schema.cashSessions.id });

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível abrir o caixa" };
  }
}

export async function closeCashSession(input: {
  closingCents: number;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "cash.write");
    const tenant = await requireTenantContext();

    const openId = await findOpenCashSessionId(tenant.id);
    if (!openId) throw new AppError("VALIDATION", "Nenhum caixa aberto");

    const closingCents = Math.round(input.closingCents);
    if (!Number.isFinite(closingCents) || closingCents < 0) {
      throw new AppError("VALIDATION", "Valor de fechamento inválido");
    }

    const db = createDb();
    // Garante que consumo profissional não distorce a sessão no momento do fechar.
    await db.execute(sql`
      delete from cash_movements cm
      using orders o
      where cm.order_id = o.id
        and cm.tenant_id = ${tenant.id}
        and o.tenant_id = ${tenant.id}
        and cm.direction = 'in'
        and coalesce(o.meta->>'kind', '') = 'staff_consumption'
    `);

    await db
      .update(schema.cashSessions)
      .set({
        closedAt: new Date(),
        closedByUserId: session.user.id,
        closingCents,
        notes: input.notes?.trim() || undefined,
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.cashSessions.id, openId), eq(schema.cashSessions.tenantId, tenant.id))
      );

    return { ok: true, id: openId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível fechar o caixa" };
  }
}

export async function addCashMovement(input: {
  direction: "in" | "out";
  amountCents: number;
  method?: string;
  description?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "cash.write");
    const tenant = await requireTenantContext();

    const openId = await findOpenCashSessionId(tenant.id);
    if (!openId) {
      throw new AppError("VALIDATION", "Abra o caixa antes de registrar movimentação");
    }

    if (input.direction !== "in" && input.direction !== "out") {
      throw new AppError("VALIDATION", "Direção inválida");
    }
    const amountCents = Math.round(input.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new AppError("VALIDATION", "Valor inválido");
    }

    let method: PaymentMethod | null = null;
    if (input.method) {
      if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) {
        throw new AppError("VALIDATION", "Forma de pagamento inválida");
      }
      method = input.method as PaymentMethod;
    } else if (input.direction === "in") {
      method = "cash";
    }

    const label =
      input.description?.trim() ||
      (input.direction === "out" ? "Sangria" : "Suprimento");

    const db = createDb();
    const [row] = await db
      .insert(schema.cashMovements)
      .values({
        tenantId: tenant.id,
        cashSessionId: openId,
        direction: input.direction,
        method,
        amountCents,
        description: label,
      })
      .returning({ id: schema.cashMovements.id });

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível registrar a movimentação" };
  }
}

/** Remove um movimento da sessão aberta (ajuste operacional do saldo esperado). */
export async function deleteCashMovement(movementId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "cash.write");
    const tenant = await requireTenantContext();

    const openId = await findOpenCashSessionId(tenant.id);
    if (!openId) {
      throw new AppError("VALIDATION", "Abra o caixa para excluir movimentos");
    }

    const id = movementId?.trim();
    if (!id) throw new AppError("VALIDATION", "Movimento inválido");

    const db = createDb();
    const [row] = await db
      .select({ id: schema.cashMovements.id })
      .from(schema.cashMovements)
      .where(
        and(
          eq(schema.cashMovements.id, id),
          eq(schema.cashMovements.tenantId, tenant.id),
          eq(schema.cashMovements.cashSessionId, openId)
        )
      )
      .limit(1);

    if (!row) {
      throw new AppError(
        "NOT_FOUND",
        "Movimento não encontrado nesta sessão aberta (só dá para apagar da sessão atual)"
      );
    }

    await db
      .delete(schema.cashMovements)
      .where(
        and(eq(schema.cashMovements.id, row.id), eq(schema.cashMovements.tenantId, tenant.id))
      );

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível excluir o movimento" };
  }
}

type PaymentCashInput = {
  tenantId: string;
  orderId?: string | null;
  method: PaymentMethod;
  amountCents: number;
  description?: string;
};

/** Usa o mesmo commit do pagamento; caixa fechado continua sendo um no-op. */
export async function recordPaymentInCashTx(
  tx: DbTransaction,
  input: PaymentCashInput
): Promise<void> {
  // Conta do cliente não movimenta caixa físico.
  if (input.method === "client_account") return;

  const [session] = await tx
    .select({ id: schema.cashSessions.id })
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, input.tenantId),
        isNull(schema.cashSessions.closedAt)
      )
    )
    .orderBy(desc(schema.cashSessions.openedAt))
    .limit(1)
    .for("update");
  if (!session) return;

  await tx.insert(schema.cashMovements).values({
    tenantId: input.tenantId,
    cashSessionId: session.id,
    orderId: input.orderId ?? null,
    direction: "in",
    method: input.method,
    amountCents: input.amountCents,
    description: input.description ?? "Pagamento de comanda",
  });
}

export async function recordPaymentInCash(input: PaymentCashInput): Promise<void> {
  const db = createDb();
  await db.transaction((tx) => recordPaymentInCashTx(tx, input));
}
