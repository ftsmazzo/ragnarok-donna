import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { createDb, schema, type DbTransaction } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { isBarberRole, isOwnerRole } from "../permissions/roles";
import { resolveSessionStaffId } from "../permissions/staff-scope";
import { assertOwnOrderAccess, getOrderDetail } from "./queries";
import { applyClientAccountDeltaTx } from "../clients/account";
import {
  calculateAccountSettlement,
  discountKeepsSettledAmount,
} from "../clients/account-reliability";

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

function accountDebtFromMeta(meta: unknown): number {
  if (!meta || typeof meta !== "object") return 0;
  const value = (meta as Record<string, unknown>).clientAccountDebtCents;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

async function lockOrderFinancialState(
  tx: DbTransaction,
  orderId: string,
  tenantId: string
) {
  const [order] = await tx
    .select({
      id: schema.orders.id,
      status: schema.orders.status,
      clientId: schema.orders.clientId,
      appointmentId: schema.orders.appointmentId,
      totalCents: schema.orders.totalCents,
      discountCents: schema.orders.discountCents,
      meta: schema.orders.meta,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.tenantId, tenantId),
        isNull(schema.orders.deletedAt)
      )
    )
    .for("update");

  if (!order) throw new AppError("NOT_FOUND", "Comanda não encontrada");
  if (order.status !== "open") {
    throw new AppError("VALIDATION", "A comanda não está aberta");
  }

  const [[paymentAgg], [itemAgg]] = await Promise.all([
    tx
      .select({
        paidCents: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.orderId, orderId),
          eq(schema.payments.tenantId, tenantId)
        )
      ),
    tx
      .select({
        count: sql<number>`count(*)::int`,
        packageCount: sql<number>`count(*) filter (where ${schema.orderItems.itemType} = 'package')::int`,
      })
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.orderId, orderId),
          eq(schema.orderItems.tenantId, tenantId)
        )
      ),
  ]);

  const paidCents = Number(paymentAgg?.paidCents ?? 0);
  const debtCents = accountDebtFromMeta(order.meta);
  const dueCents = Math.max(0, order.totalCents - order.discountCents);

  return {
    ...order,
    paidCents,
    debtCents,
    balanceCents: dueCents - paidCents - debtCents,
    itemCount: Number(itemAgg?.count ?? 0),
    packageCount: Number(itemAgg?.packageCount ?? 0),
  };
}

async function recalculateOrderTotal(orderId: string, tenantId: string) {
  const db = createDb();
  const [agg] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
    })
    .from(schema.orderItems)
    .where(
      and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.tenantId, tenantId))
    );

  await db
    .update(schema.orders)
    .set({
      totalCents: Number(agg?.total ?? 0),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)));
}

async function assertOpenOrder(orderId: string, tenantId: string) {
  const db = createDb();
  const [order] = await db
    .select({
      id: schema.orders.id,
      status: schema.orders.status,
      totalCents: schema.orders.totalCents,
      discountCents: schema.orders.discountCents,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.tenantId, tenantId),
        isNull(schema.orders.deletedAt)
      )
    )
    .limit(1);

  if (!order) throw new AppError("NOT_FOUND", "Comanda não encontrada");
  if (order.status !== "open") {
    throw new AppError("VALIDATION", "Comanda não está aberta");
  }
  return order;
}

/** Barbeiro: só produtos na própria comanda. Demais roles: write completo. */
async function assertFullOrderWrite() {
  const session = await requireSession();
  requireCapability(session, "orders.write");
  if (isBarberRole(session.role)) {
    throw new ForbiddenError("Barbeiro só pode lançar produtos na comanda");
  }
  return session;
}

function calcCommission(
  totalCents: number,
  bps: number | null | undefined
): { commissionBps: number | null; commissionCents: number | null } {
  if (bps == null || bps < 0) return { commissionBps: null, commissionCents: null };
  return {
    commissionBps: bps,
    commissionCents: Math.round((totalCents * bps) / 10000),
  };
}

export async function openOrder(input: {
  clientId?: string;
  appointmentId?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    const db = createDb();

    let clientId = input.clientId || undefined;
    let appointmentId = input.appointmentId || undefined;

    if (clientId) {
      const [client] = await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(
          and(
            eq(schema.clients.id, clientId),
            eq(schema.clients.tenantId, tenant.id),
            isNull(schema.clients.deletedAt)
          )
        )
        .limit(1);
      if (!client) throw new AppError("VALIDATION", "Cliente inválido");
    }

    let seedServiceId: string | null = null;
    let seedStaffId: string | null = null;
    let seedPriceCents: number | null = null;
    let seedServiceName: string | null = null;
    let seedCommissionBps: number | null = null;

    if (appointmentId) {
      const [appt] = await db
        .select({
          id: schema.appointments.id,
          orderId: schema.appointments.orderId,
          clientId: schema.appointments.clientId,
          staffId: schema.appointments.staffId,
          serviceId: schema.appointments.serviceId,
          priceCents: schema.appointments.priceCents,
          serviceName: schema.services.name,
          servicePriceCents: schema.services.priceCents,
          serviceCommissionBps: schema.services.commissionBps,
        })
        .from(schema.appointments)
        .leftJoin(
          schema.services,
          and(
            eq(schema.services.id, schema.appointments.serviceId),
            eq(schema.services.tenantId, tenant.id)
          )
        )
        .where(
          and(
            eq(schema.appointments.id, appointmentId),
            eq(schema.appointments.tenantId, tenant.id),
            isNull(schema.appointments.deletedAt)
          )
        )
        .limit(1);
      if (!appt) throw new AppError("VALIDATION", "Agendamento inválido");
      if (appt.orderId) {
        return { ok: true, id: appt.orderId };
      }
      if (!clientId && appt.clientId) {
        clientId = appt.clientId;
      }
      seedServiceId = appt.serviceId;
      seedStaffId = appt.staffId;
      seedServiceName = appt.serviceName;
      seedPriceCents =
        appt.priceCents != null && appt.priceCents > 0
          ? appt.priceCents
          : appt.servicePriceCents;
      seedCommissionBps = appt.serviceCommissionBps;
    }

    const [row] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenant.id,
        clientId: clientId || null,
        appointmentId: appointmentId || null,
        status: "open",
        notes: input.notes?.trim() || null,
        openedByUserId: session.user.id,
      })
      .returning({ id: schema.orders.id });

    if (appointmentId) {
      await db
        .update(schema.appointments)
        .set({
          orderId: row.id,
          status: "in_progress",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.appointments.id, appointmentId),
            eq(schema.appointments.tenantId, tenant.id)
          )
        );
    }

    if (seedServiceId && seedServiceName && seedPriceCents != null) {
      const { commissionBps, commissionCents } = calcCommission(
        seedPriceCents,
        seedCommissionBps
      );
      await db.insert(schema.orderItems).values({
        tenantId: tenant.id,
        orderId: row.id,
        itemType: "service",
        serviceId: seedServiceId,
        productId: null,
        packageId: null,
        staffId: seedStaffId,
        description: seedServiceName,
        qty: 1,
        unitPriceCents: seedPriceCents,
        discountCents: 0,
        totalCents: seedPriceCents,
        commissionBps,
        commissionCents,
        performedAt: new Date(),
        meta: {},
      });
      await recalculateOrderTotal(row.id, tenant.id);
    }

    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível abrir a comanda" };
  }
}

/**
 * Conta Recorrência (Agenda): abre/usa a comanda do horário e aplica 1 crédito
 * do pacote no serviço do agendamento (comissão no preço de tabela).
 *
 * Converte o item seed in-place (não remove→add) sob lock de transação.
 */
export async function applyRecurrencePackageFromAppointment(input: {
  appointmentId: string;
  clientPackageId: string;
}): Promise<ActionResult> {
  try {
    await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    const db = createDb();

    const [appt] = await db
      .select({
        id: schema.appointments.id,
        orderId: schema.appointments.orderId,
        clientId: schema.appointments.clientId,
        staffId: schema.appointments.staffId,
        serviceId: schema.appointments.serviceId,
        status: schema.appointments.status,
      })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.id, input.appointmentId),
          eq(schema.appointments.tenantId, tenant.id),
          isNull(schema.appointments.deletedAt)
        )
      )
      .limit(1);

    if (!appt) throw new AppError("VALIDATION", "Agendamento inválido");
    if (appt.status === "cancelled" || appt.status === "completed" || appt.status === "no_show") {
      throw new AppError("VALIDATION", "Agendamento já encerrado");
    }
    if (!appt.clientId) throw new AppError("VALIDATION", "Agendamento sem cliente");
    if (!appt.serviceId) throw new AppError("VALIDATION", "Agendamento sem serviço");
    if (!input.clientPackageId.trim()) {
      throw new AppError("VALIDATION", "Selecione um pacote");
    }

    const [pkg] = await db
      .select({
        id: schema.clientPackages.id,
        clientId: schema.clientPackages.clientId,
        status: schema.clientPackages.status,
      })
      .from(schema.clientPackages)
      .where(
        and(
          eq(schema.clientPackages.id, input.clientPackageId),
          eq(schema.clientPackages.tenantId, tenant.id)
        )
      )
      .limit(1);
    if (!pkg || pkg.clientId !== appt.clientId) {
      throw new AppError("VALIDATION", "Pacote não pertence a este cliente");
    }
    if (pkg.status !== "active") {
      throw new AppError("VALIDATION", "Pacote sem créditos ativos");
    }

    let orderId = appt.orderId;
    if (!orderId) {
      const opened = await openOrder({
        appointmentId: appt.id,
        clientId: appt.clientId,
      });
      if (!opened.ok) return opened;
      orderId = opened.id;
    }

    await assertOpenOrder(orderId, tenant.id);

    const { debitOneCredit } = await import("../packages/credits");

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`recurrence:${appt.id}`}))`
      );

      const items = await tx
        .select({
          id: schema.orderItems.id,
          description: schema.orderItems.description,
          unitPriceCents: schema.orderItems.unitPriceCents,
          qty: schema.orderItems.qty,
          discountCents: schema.orderItems.discountCents,
          commissionBps: schema.orderItems.commissionBps,
          staffId: schema.orderItems.staffId,
          meta: schema.orderItems.meta,
        })
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.orderId, orderId!),
            eq(schema.orderItems.tenantId, tenant.id),
            eq(schema.orderItems.serviceId, appt.serviceId!)
          )
        )
        .for("update");

      const alreadyRedeemed = items.find((it) => {
        const meta = (it.meta ?? {}) as Record<string, unknown>;
        return Boolean(meta.redeemed);
      });
      if (alreadyRedeemed) {
        throw new AppError(
          "VALIDATION",
          "Este serviço já foi lançado com crédito de pacote nesta comanda"
        );
      }

      // Só o seed / primeira linha não resgatada — não apaga lançamentos extras.
      const seed = items[0] ?? null;

      const debit = await debitOneCredit({
        tenantId: tenant.id,
        clientId: appt.clientId!,
        serviceId: appt.serviceId!,
        clientPackageId: input.clientPackageId,
        tx,
      });

      const now = new Date();

      if (seed) {
        const lineGross = seed.unitPriceCents * seed.qty;
        const coveredCents = lineGross;
        const baseName = seed.description.replace(/\s·\sPacote.*$/i, "").trim() || seed.description;
        const commission = calcCommission(lineGross, seed.commissionBps);
        await tx
          .update(schema.orderItems)
          .set({
            description: `${baseName} · Pacote`,
            discountCents: 0,
            totalCents: 0,
            commissionBps: commission.commissionBps,
            commissionCents: commission.commissionCents,
            staffId: seed.staffId ?? appt.staffId,
            meta: {
              redeemed: true,
              creditId: debit.creditId,
              clientPackageId: debit.clientPackageId,
              coveredCents,
            },
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.orderItems.id, seed.id),
              eq(schema.orderItems.tenantId, tenant.id)
            )
          );
      } else {
        const [svc] = await tx
          .select({
            id: schema.services.id,
            name: schema.services.name,
            priceCents: schema.services.priceCents,
            commissionBps: schema.services.commissionBps,
          })
          .from(schema.services)
          .where(
            and(
              eq(schema.services.id, appt.serviceId!),
              eq(schema.services.tenantId, tenant.id),
              isNull(schema.services.deletedAt)
            )
          )
          .limit(1);
        if (!svc) throw new AppError("VALIDATION", "Serviço inválido");

        let staffId = appt.staffId;
        let staffCommissionBps: number | null = null;
        if (staffId) {
          const [st] = await tx
            .select({
              id: schema.staff.id,
              defaultCommissionBps: schema.staff.defaultCommissionBps,
            })
            .from(schema.staff)
            .where(
              and(
                eq(schema.staff.id, staffId),
                eq(schema.staff.tenantId, tenant.id),
                isNull(schema.staff.deletedAt)
              )
            )
            .limit(1);
          if (!st) throw new AppError("VALIDATION", "Profissional inválido");
          staffCommissionBps = st.defaultCommissionBps;
        }
        if (!staffId) {
          throw new AppError("VALIDATION", "Informe o profissional do serviço");
        }

        const lineGross = svc.priceCents;
        const commission = calcCommission(
          lineGross,
          svc.commissionBps ?? staffCommissionBps
        );
        await tx.insert(schema.orderItems).values({
          tenantId: tenant.id,
          orderId: orderId!,
          itemType: "service",
          serviceId: svc.id,
          productId: null,
          packageId: null,
          staffId,
          description: `${svc.name} · Pacote`,
          qty: 1,
          unitPriceCents: svc.priceCents,
          discountCents: 0,
          totalCents: 0,
          commissionBps: commission.commissionBps,
          commissionCents: commission.commissionCents,
          performedAt: now,
          meta: {
            redeemed: true,
            creditId: debit.creditId,
            clientPackageId: debit.clientPackageId,
            coveredCents: lineGross,
          },
        });
      }
    });

    await recalculateOrderTotal(orderId, tenant.id);
    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível aplicar o pacote" };
  }
}

/** Opções de pacote do cliente que cobrem o serviço do agendamento. */
export async function listRecurrencePackagesForAppointment(appointmentId: string): Promise<
  | {
      ok: true;
      serviceName: string | null;
      options: Array<{
        clientPackageId: string;
        packageName: string;
        remainingQty: number;
        expiresAt: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  try {
    await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    const db = createDb();

    const [appt] = await db
      .select({
        clientId: schema.appointments.clientId,
        serviceId: schema.appointments.serviceId,
        serviceName: schema.services.name,
      })
      .from(schema.appointments)
      .leftJoin(
        schema.services,
        and(
          eq(schema.services.id, schema.appointments.serviceId),
          eq(schema.services.tenantId, tenant.id)
        )
      )
      .where(
        and(
          eq(schema.appointments.id, appointmentId),
          eq(schema.appointments.tenantId, tenant.id),
          isNull(schema.appointments.deletedAt)
        )
      )
      .limit(1);

    if (!appt?.clientId) return { ok: false, error: "Agendamento sem cliente" };
    if (!appt.serviceId) return { ok: false, error: "Agendamento sem serviço" };

    const { listClientCredits } = await import("../packages/credits");
    const credits = await listClientCredits(appt.clientId);
    const matching = credits.filter((c) => c.serviceId === appt.serviceId && c.remainingQty > 0);

    const byPkg = new Map<
      string,
      { clientPackageId: string; packageName: string; remainingQty: number; expiresAt: string | null }
    >();
    for (const c of matching) {
      const prev = byPkg.get(c.clientPackageId);
      if (prev) {
        prev.remainingQty += c.remainingQty;
      } else {
        byPkg.set(c.clientPackageId, {
          clientPackageId: c.clientPackageId,
          packageName: c.packageName,
          remainingQty: c.remainingQty,
          expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        });
      }
    }

    return {
      ok: true,
      serviceName: appt.serviceName,
      options: [...byPkg.values()],
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível listar pacotes" };
  }
}

export async function addOrderItem(input: {
  orderId: string;
  itemType: "service" | "product" | "package";
  catalogId: string;
  staffId?: string;
  qty?: number;
  discountCents?: number;
  /**
   * Quanto o pacote cobre em R$ (abate). Só com usePackageCredit.
   * Default = preço cheio (100%). Menor que o bruto → residual (diferença) a pagar.
   */
  coveredCents?: number;
  /** Observação da venda (pacote). */
  saleNotes?: string;
  /** Usar 1 crédito de pacote (abate); comissão no preço de tabela. */
  usePackageCredit?: boolean;
  /** Pacote do cliente (Conta Recorrência). Sem isso, FIFO. */
  clientPackageId?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    await assertOpenOrder(input.orderId, tenant.id);

    const barber = isBarberRole(session.role);
    let staffIdInput = input.staffId;
    if (barber) {
      if (input.itemType !== "product") {
        throw new ForbiddenError("Barbeiro só pode lançar produtos na comanda");
      }
      await assertOwnOrderAccess(input.orderId);
      const ownStaffId = await resolveSessionStaffId(session);
      if (!ownStaffId) {
        throw new ForbiddenError(
          "Conta não vinculada a um profissional. Peça ao dono para vincular em Configurações → Equipe."
        );
      }
      staffIdInput = ownStaffId;
    }

    const qty = Math.max(1, Math.min(99, input.qty ?? 1));
    const discountCents = Math.max(0, input.discountCents ?? 0);
    const db = createDb();

    if (input.itemType === "package") {
      return await addPackageSaleItem({
        orderId: input.orderId,
        packageId: input.catalogId,
        staffId: staffIdInput,
        tenantId: tenant.id,
        saleNotes: input.saleNotes,
      });
    }

    let description = "";
    let unitPriceCents = 0;
    let serviceId: string | null = null;
    let productId: string | null = null;
    let itemCommissionBps: number | null = null;

    if (input.itemType === "service") {
      const [svc] = await db
        .select({
          id: schema.services.id,
          name: schema.services.name,
          priceCents: schema.services.priceCents,
          commissionBps: schema.services.commissionBps,
        })
        .from(schema.services)
        .where(
          and(
            eq(schema.services.id, input.catalogId),
            eq(schema.services.tenantId, tenant.id),
            isNull(schema.services.deletedAt)
          )
        )
        .limit(1);
      if (!svc) throw new AppError("VALIDATION", "Serviço inválido");
      description = svc.name;
      unitPriceCents = svc.priceCents;
      serviceId = svc.id;
      itemCommissionBps = svc.commissionBps;
    } else {
      const [prod] = await db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          priceCents: schema.products.priceCents,
          commissionBps: schema.products.commissionBps,
          stockQty: schema.products.stockQty,
          forSale: schema.products.forSale,
        })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.id, input.catalogId),
            eq(schema.products.tenantId, tenant.id),
            isNull(schema.products.deletedAt)
          )
        )
        .limit(1);
      if (!prod) throw new AppError("VALIDATION", "Produto inválido");
      if (!prod.forSale) {
        throw new AppError("VALIDATION", "Produto não disponível para venda");
      }
      if (prod.stockQty < qty) {
        throw new AppError("VALIDATION", `Estoque insuficiente (${prod.stockQty} un.)`);
      }
      description = prod.name;
      unitPriceCents = prod.priceCents;
      productId = prod.id;
      itemCommissionBps = prod.commissionBps;
    }

    let staffId: string | null = staffIdInput || null;
    let staffCommissionBps: number | null = null;

    if (!staffId && input.itemType === "service") {
      const [orderAppt] = await db
        .select({ staffId: schema.appointments.staffId })
        .from(schema.orders)
        .leftJoin(
          schema.appointments,
          eq(schema.appointments.id, schema.orders.appointmentId)
        )
        .where(
          and(eq(schema.orders.id, input.orderId), eq(schema.orders.tenantId, tenant.id))
        )
        .limit(1);
      staffId = orderAppt?.staffId ?? null;
    }

    if (input.itemType === "service" && !staffId) {
      throw new AppError("VALIDATION", "Informe o profissional do serviço");
    }

    if (staffId) {
      const [st] = await db
        .select({
          id: schema.staff.id,
          defaultCommissionBps: schema.staff.defaultCommissionBps,
        })
        .from(schema.staff)
        .where(
          and(
            eq(schema.staff.id, staffId),
            eq(schema.staff.tenantId, tenant.id),
            isNull(schema.staff.deletedAt)
          )
        )
        .limit(1);
      if (!st) throw new AppError("VALIDATION", "Profissional inválido");
      staffCommissionBps = st.defaultCommissionBps;
    }

    const lineGross = unitPriceCents * qty;
    let appliedDiscount = discountCents;
    let coveredCents = 0;
    let totalCents = lineGross - appliedDiscount;
    let meta: Record<string, unknown> = {};
    let useCredit = Boolean(
      input.usePackageCredit &&
        ((input.itemType === "service" && serviceId) ||
          (input.itemType === "product" && productId))
    );

    if (useCredit) {
      const [orderRow] = await db
        .select({ clientId: schema.orders.clientId })
        .from(schema.orders)
        .where(and(eq(schema.orders.id, input.orderId), eq(schema.orders.tenantId, tenant.id)))
        .limit(1);
      if (!orderRow?.clientId) {
        throw new AppError("VALIDATION", "Vincule um cliente à comanda para usar crédito");
      }
      if (qty !== 1) {
        throw new AppError("VALIDATION", "No uso de crédito, adicione 1 unidade por vez");
      }

      const { debitOneCredit } = await import("../packages/credits");
      const debit = await debitOneCredit({
        tenantId: tenant.id,
        clientId: orderRow.clientId,
        serviceId: serviceId ?? undefined,
        productId: productId ?? undefined,
        clientPackageId: input.clientPackageId,
      });

      // Abate ≠ desconto: cobertura do pacote + desconto comercial no residual.
      const requestedCover =
        input.coveredCents != null && Number.isFinite(input.coveredCents)
          ? Math.round(input.coveredCents)
          : lineGross;
      coveredCents = Math.max(0, Math.min(lineGross, requestedCover));
      const residual = Math.max(0, lineGross - coveredCents);
      appliedDiscount = Math.max(0, Math.min(discountCents, residual));
      totalCents = residual - appliedDiscount;
      meta = {
        redeemed: true,
        creditId: debit.creditId,
        clientPackageId: debit.clientPackageId,
        coveredCents,
      };
      description =
        totalCents > 0
          ? `${description} · Pacote + diferença`
          : `${description} · Pacote`;
    } else if (appliedDiscount > lineGross) {
      throw new AppError("VALIDATION", "Desconto maior que o valor do item");
    }

    const bps = itemCommissionBps ?? staffCommissionBps;
    // Pacote: comissão no preço de tabela. Demais: sobre o líquido do item.
    const commission = calcCommission(useCredit ? lineGross : totalCents, bps);

    const [row] = await db
      .insert(schema.orderItems)
      .values({
        tenantId: tenant.id,
        orderId: input.orderId,
        itemType: input.itemType,
        serviceId,
        productId,
        packageId: null,
        staffId,
        description,
        qty,
        unitPriceCents,
        discountCents: appliedDiscount,
        totalCents,
        commissionBps: commission.commissionBps,
        commissionCents: commission.commissionCents,
        performedAt: new Date(),
        meta,
      })
      .returning({ id: schema.orderItems.id });

    if (productId) {
      await db
        .update(schema.products)
        .set({
          stockQty: sql`${schema.products.stockQty} - ${qty}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenant.id))
        );
    }

    await recalculateOrderTotal(input.orderId, tenant.id);
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível adicionar o item" };
  }
}

async function addPackageSaleItem(input: {
  orderId: string;
  packageId: string;
  staffId?: string;
  tenantId: string;
  saleNotes?: string;
}): Promise<ActionResult> {
  const db = createDb();
  const [orderRow] = await db
    .select({ clientId: schema.orders.clientId })
    .from(schema.orders)
    .where(
      and(eq(schema.orders.id, input.orderId), eq(schema.orders.tenantId, input.tenantId))
    )
    .limit(1);
  if (!orderRow?.clientId) {
    throw new AppError("VALIDATION", "Vincule um cliente à comanda para vender pacote");
  }

  const [pkg] = await db
    .select({
      id: schema.packages.id,
      name: schema.packages.name,
      priceCents: schema.packages.priceCents,
      expiresAfterDays: schema.packages.expiresAfterDays,
      commissionBps: schema.packages.commissionBps,
      items: schema.packages.items,
    })
    .from(schema.packages)
    .where(
      and(
        eq(schema.packages.id, input.packageId),
        eq(schema.packages.tenantId, input.tenantId),
        eq(schema.packages.isActive, true),
        isNull(schema.packages.deletedAt)
      )
    )
    .limit(1);
  if (!pkg) throw new AppError("VALIDATION", "Pacote inválido");

  const { resolvePackageServiceItems } = await import("../packages/credits");
  const { items } = await resolvePackageServiceItems(input.tenantId, pkg.items, {
    healPackageId: pkg.id,
  });
  if (items.length === 0) {
    throw new AppError(
      "VALIDATION",
      "Configure os serviços/produtos deste pacote em Cadastros → Pacotes"
    );
  }

  let staffId: string | null = input.staffId || null;
  let staffCommissionBps: number | null = null;
  if (staffId) {
    const [st] = await db
      .select({
        id: schema.staff.id,
        defaultCommissionBps: schema.staff.defaultCommissionBps,
      })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.id, staffId),
          eq(schema.staff.tenantId, input.tenantId),
          isNull(schema.staff.deletedAt)
        )
      )
      .limit(1);
    if (!st) throw new AppError("VALIDATION", "Profissional inválido");
    staffCommissionBps = st.defaultCommissionBps;
  }

  const commission = calcCommission(
    pkg.priceCents,
    pkg.commissionBps ?? staffCommissionBps
  );

  const rowId = await db.transaction(async (tx) => {
    const [lockedOrder] = await tx
      .select({ clientId: schema.orders.clientId, status: schema.orders.status })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, input.orderId),
          eq(schema.orders.tenantId, input.tenantId),
          isNull(schema.orders.deletedAt)
        )
      )
      .for("update");
    if (!lockedOrder || lockedOrder.status !== "open") {
      throw new AppError("VALIDATION", "A comanda não está aberta");
    }
    if (!lockedOrder.clientId) {
      throw new AppError("VALIDATION", "Vincule um cliente à comanda para vender pacote");
    }

    const [accountPayment] = await tx
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.orderId, input.orderId),
          eq(schema.payments.tenantId, input.tenantId),
          eq(schema.payments.method, "client_account")
        )
      )
      .limit(1);
    if (accountPayment) {
      throw new AppError(
        "VALIDATION",
        "Remova o pagamento pela Conta do Cliente antes de adicionar um pacote"
      );
    }

    const [row] = await tx
      .insert(schema.orderItems)
      .values({
        tenantId: input.tenantId,
        orderId: input.orderId,
        itemType: "package",
        serviceId: null,
        productId: null,
        packageId: pkg.id,
        staffId,
        description: `Pacote · ${pkg.name}`,
        qty: 1,
        unitPriceCents: pkg.priceCents,
        discountCents: 0,
        totalCents: pkg.priceCents,
        commissionBps: commission.commissionBps,
        commissionCents: commission.commissionCents,
        performedAt: new Date(),
        // Carteira só libera ao fechar/pagar a comanda (evita crédito órfão).
        meta: {
          packageSale: true,
          walletPending: true,
          ...(input.saleNotes?.trim()
            ? { saleNotes: input.saleNotes.trim().slice(0, 2000) }
            : {}),
        },
      })
      .returning({ id: schema.orderItems.id });

    const [agg] = await tx
      .select({
        total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
      })
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.orderId, input.orderId),
          eq(schema.orderItems.tenantId, input.tenantId)
        )
      );
    await tx
      .update(schema.orders)
      .set({ totalCents: Number(agg?.total ?? 0), updatedAt: new Date() })
      .where(
        and(
          eq(schema.orders.id, input.orderId),
          eq(schema.orders.tenantId, input.tenantId)
        )
      );
    return row.id;
  });

  return { ok: true, id: rowId };
}

export async function removeOrderItem(itemId: string): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    const db = createDb();

    const [item] = await db
      .select({
        id: schema.orderItems.id,
        orderId: schema.orderItems.orderId,
        itemType: schema.orderItems.itemType,
        productId: schema.orderItems.productId,
        qty: schema.orderItems.qty,
        meta: schema.orderItems.meta,
      })
      .from(schema.orderItems)
      .where(
        and(eq(schema.orderItems.id, itemId), eq(schema.orderItems.tenantId, tenant.id))
      )
      .limit(1);

    if (!item) throw new AppError("NOT_FOUND", "Item não encontrado");
    const order = await assertOpenOrder(item.orderId, tenant.id);

    if (isBarberRole(session.role)) {
      if (item.itemType !== "product") {
        throw new ForbiddenError("Barbeiro só pode remover produtos");
      }
      await assertOwnOrderAccess(item.orderId);
    }

    const [paidRow] = await db
      .select({
        paid: sql<number>`coalesce(sum(${schema.payments.amountCents}), 0)::int`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.orderId, item.orderId),
          eq(schema.payments.tenantId, tenant.id)
        )
      );
    const [itemsRow] = await db
      .select({
        total: sql<number>`coalesce(sum(${schema.orderItems.totalCents}), 0)::int`,
      })
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.orderId, item.orderId),
          eq(schema.orderItems.tenantId, tenant.id),
          ne(schema.orderItems.id, itemId)
        )
      );
    const nextTotal = Number(itemsRow?.total ?? 0);
    const paidCents = Number(paidRow?.paid ?? 0);
    if (paidCents > 0 && nextTotal - order.discountCents < paidCents) {
      throw new AppError(
        "VALIDATION",
        "Não é possível remover: o total ficaria abaixo do já pago. Ajuste o pagamento (estorno manual) antes."
      );
    }

    const meta = (item.meta ?? {}) as Record<string, unknown>;
    if (meta.redeemed && typeof meta.creditId === "string" && typeof meta.clientPackageId === "string") {
      const { restoreOneCredit } = await import("../packages/credits");
      await restoreOneCredit({
        tenantId: tenant.id,
        creditId: meta.creditId,
        clientPackageId: meta.clientPackageId,
      });
    }

    if (meta.packageSale && typeof meta.clientPackageId === "string") {
      const { cancelClientPackageSale } = await import("../packages/credits");
      await cancelClientPackageSale({
        tenantId: tenant.id,
        clientPackageId: meta.clientPackageId,
      });
    }

    if (item.productId) {
      await db
        .update(schema.products)
        .set({
          stockQty: sql`${schema.products.stockQty} + ${item.qty}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.products.id, item.productId),
            eq(schema.products.tenantId, tenant.id)
          )
        );
    }

    await db
      .delete(schema.orderItems)
      .where(
        and(eq(schema.orderItems.id, itemId), eq(schema.orderItems.tenantId, tenant.id))
      );

    await recalculateOrderTotal(item.orderId, tenant.id);
    return { ok: true, id: item.orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível remover o item" };
  }
}

export async function addPayment(input: {
  orderId: string;
  method: string;
  amountCents: number;
}): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    await assertOpenOrder(input.orderId, tenant.id);

    if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) {
      throw new AppError("VALIDATION", "Forma de pagamento inválida");
    }
    const amountCents = Math.round(input.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new AppError("VALIDATION", "Valor do pagamento inválido");
    }

    const method = input.method as PaymentMethod;
    const db = createDb();

    if (method === "client_account") {
      const paymentId = await db.transaction(async (tx) => {
        const state = await lockOrderFinancialState(
          tx,
          input.orderId,
          tenant.id
        );
        if (state.packageCount > 0) {
          throw new AppError(
            "VALIDATION",
            "Conta do Cliente não está disponível para venda de pacote"
          );
        }
        if (amountCents > state.balanceCents) {
          const resto = (state.balanceCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
          throw new AppError("VALIDATION", `Valor excede o saldo (restante ${resto})`);
        }
        if (!state.clientId) {
          throw new AppError("VALIDATION", "Vincule um cliente para usar a Conta do Cliente");
        }

        const [client] = await tx
          .select({ accountBalanceCents: schema.clients.accountBalanceCents })
          .from(schema.clients)
          .where(
            and(
              eq(schema.clients.id, state.clientId),
              eq(schema.clients.tenantId, tenant.id)
            )
          )
          .for("update");
        const credit = client?.accountBalanceCents ?? 0;
        if (credit <= 0) {
          throw new AppError("VALIDATION", "Cliente sem crédito na conta");
        }
        if (amountCents > credit) {
          const disp = (credit / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
          throw new AppError("VALIDATION", `Crédito disponível na conta: ${disp}`);
        }

        const [payment] = await tx
          .insert(schema.payments)
          .values({
            tenantId: tenant.id,
            orderId: input.orderId,
            method,
            amountCents,
          })
          .returning({ id: schema.payments.id });

        await applyClientAccountDeltaTx(tx, {
          tenantId: tenant.id,
          clientId: state.clientId,
          deltaCents: -amountCents,
          reason: "order_payment",
          notes: "Pagamento com crédito da conta",
          orderId: input.orderId,
          paymentId: payment.id,
          createdByUserId: session.user.id,
        });

        return payment.id;
      });
      return { ok: true, id: paymentId };
    }

    const paymentId = await db.transaction(async (tx) => {
      const state = await lockOrderFinancialState(tx, input.orderId, tenant.id);
      if (amountCents > state.balanceCents) {
        const resto = (state.balanceCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        throw new AppError("VALIDATION", `Valor excede o saldo (restante ${resto})`);
      }

      const [payment] = await tx
        .insert(schema.payments)
        .values({
          tenantId: tenant.id,
          orderId: input.orderId,
          method,
          amountCents,
        })
        .returning({ id: schema.payments.id });

      const { recordPaymentInCashTx } = await import("../finance/mutations");
      await recordPaymentInCashTx(tx, {
        tenantId: tenant.id,
        orderId: input.orderId,
        method,
        amountCents,
      });
      return payment.id;
    });

    return { ok: true, id: paymentId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível registrar o pagamento" };
  }
}

export async function setOrderDiscount(
  orderId: string,
  discountCents: number
): Promise<ActionResult> {
  try {
    await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    const d = Math.max(0, Math.round(discountCents));
    const db = createDb();
    await db.transaction(async (tx) => {
      const state = await lockOrderFinancialState(tx, orderId, tenant.id);
      if (d > state.totalCents) {
        throw new AppError("VALIDATION", "Desconto maior que o total da comanda");
      }
      if (
        !discountKeepsSettledAmount({
          totalCents: state.totalCents,
          discountCents: d,
          paidCents: state.paidCents,
          debtCents: state.debtCents,
        })
      ) {
        throw new AppError(
          "VALIDATION",
          "O desconto não pode deixar o total menor que o valor já pago ou lançado na conta"
        );
      }

      await tx
        .update(schema.orders)
        .set({ discountCents: d, updatedAt: new Date() })
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));
    });

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível aplicar o desconto" };
  }
}

export async function closeOrder(orderId: string): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    await assertOpenOrder(orderId, tenant.id);

    const detail = await getOrderDetail(orderId);
    if (detail.items.length === 0) {
      throw new AppError("VALIDATION", "Adicione ao menos um item antes de fechar");
    }
    if (detail.balanceCents > 0) {
      const resto = (detail.balanceCents / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      throw new AppError("VALIDATION", `Ainda falta pagar ${resto}`);
    }

    const db = createDb();
    if (detail.clientId) {
      const { activateClientPackagesForOrder } = await import("../packages/credits");
      await activateClientPackagesForOrder({
        tenantId: tenant.id,
        orderId,
        clientId: detail.clientId,
      });
    }

    await db
      .update(schema.orders)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedByUserId: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));

    if (detail.appointmentId) {
      await db
        .update(schema.appointments)
        .set({ status: "completed", updatedAt: new Date() })
        .where(
          and(
            eq(schema.appointments.id, detail.appointmentId),
            eq(schema.appointments.tenantId, tenant.id)
          )
        );
    }

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível fechar a comanda" };
  }
}

export async function setOrderClient(input: {
  orderId: string;
  clientId: string;
}): Promise<ActionResult> {
  try {
    await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    const db = createDb();
    const orderId = input.orderId.trim();
    const clientId = input.clientId.trim();
    if (!orderId || !clientId) {
      throw new AppError("VALIDATION", "Comanda e cliente são obrigatórios");
    }

    await db.transaction(async (tx) => {
      const [order] = await tx
        .select({ clientId: schema.orders.clientId, status: schema.orders.status })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.id, orderId),
            eq(schema.orders.tenantId, tenant.id),
            isNull(schema.orders.deletedAt)
          )
        )
        .for("update");
      if (!order) throw new AppError("NOT_FOUND", "Comanda não encontrada");
      if (order.status !== "open") {
        throw new AppError("VALIDATION", "A comanda não está aberta");
      }

      const [client] = await tx
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(
          and(
            eq(schema.clients.id, clientId),
            eq(schema.clients.tenantId, tenant.id),
            eq(schema.clients.isActive, true),
            isNull(schema.clients.deletedAt)
          )
        )
        .limit(1);
      if (!client) throw new AppError("VALIDATION", "Cliente não encontrado ou inativo");

      if (order.clientId && order.clientId !== clientId) {
        const [accountPayment] = await tx
          .select({ id: schema.payments.id })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.orderId, orderId),
              eq(schema.payments.tenantId, tenant.id),
              eq(schema.payments.method, "client_account")
            )
          )
          .limit(1);
        if (accountPayment) {
          throw new AppError(
            "VALIDATION",
            "Não dá para trocar o cliente: a Conta do Cliente já foi usada nesta comanda."
          );
        }

        const orderItems = await tx
          .select({
            itemType: schema.orderItems.itemType,
            meta: schema.orderItems.meta,
          })
          .from(schema.orderItems)
          .where(
            and(
              eq(schema.orderItems.orderId, orderId),
              eq(schema.orderItems.tenantId, tenant.id)
            )
          );
        for (const item of orderItems) {
          const meta = (item.meta ?? {}) as Record<string, unknown>;
          if (meta.redeemed) {
            throw new AppError(
              "VALIDATION",
              "Não dá para trocar o cliente: há item com crédito de pacote já usado nesta comanda."
            );
          }
          if (meta.packageSale || item.itemType === "package") {
            throw new AppError(
              "VALIDATION",
              "Não dá para trocar o cliente: há venda de pacote nesta comanda."
            );
          }
        }
      }

      await tx
        .update(schema.orders)
        .set({ clientId, updatedAt: new Date() })
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));
    });

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível vincular o cliente" };
  }
}

/** Reabre comanda fechada (owner/admin). Não apaga pagamentos já lançados. */
export async function reopenOrder(orderId: string): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    if (!isOwnerRole(session.role)) {
      throw new ForbiddenError("Só dono/admin pode reabrir comanda");
    }
    const tenant = await requireTenantContext();
    const db = createDb();

    await db.transaction(async (tx) => {
      const [order] = await tx
        .select({
          id: schema.orders.id,
          status: schema.orders.status,
          clientId: schema.orders.clientId,
          meta: schema.orders.meta,
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.id, orderId),
            eq(schema.orders.tenantId, tenant.id),
            isNull(schema.orders.deletedAt)
          )
        )
        .for("update");

      if (!order) throw new AppError("NOT_FOUND", "Comanda não encontrada");
      if (order.status !== "closed") {
        throw new AppError("VALIDATION", "Só é possível reabrir comanda fechada");
      }

      const prevMeta = (order.meta ?? {}) as Record<string, unknown>;
      const settlementCents =
        typeof prevMeta.clientAccountSettlementCents === "number"
          ? Math.max(0, Math.round(prevMeta.clientAccountSettlementCents))
          : 0;
      const accountClientId =
        typeof prevMeta.clientAccountClientId === "string"
          ? prevMeta.clientAccountClientId
          : order.clientId;
      const accountPaymentId =
        typeof prevMeta.clientAccountPaymentId === "string"
          ? prevMeta.clientAccountPaymentId
          : null;

      if (settlementCents > 0 && accountClientId) {
        await applyClientAccountDeltaTx(tx, {
          tenantId: tenant.id,
          clientId: accountClientId,
          deltaCents: settlementCents,
          reason: "order_reversal",
          notes: "Estorno ao reabrir comanda",
          orderId,
          createdByUserId: session.user.id,
        });
        if (accountPaymentId) {
          await tx
            .delete(schema.payments)
            .where(
              and(
                eq(schema.payments.id, accountPaymentId),
                eq(schema.payments.tenantId, tenant.id),
                eq(schema.payments.orderId, orderId)
              )
            );
        }
      }

      const restMeta = { ...prevMeta };
      delete restMeta.clientAccountDebtCents;
      delete restMeta.clientAccountSettlementCents;
      delete restMeta.clientAccountPaymentId;
      delete restMeta.clientAccountClientId;
      await tx
        .update(schema.orders)
        .set({
          status: "open",
          closedAt: null,
          closedByUserId: null,
          meta: {
            ...restMeta,
            reopenedAt: new Date().toISOString(),
            reopenedBy: session.user.id,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));
    });

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível reabrir a comanda" };
  }
}

/** Registra pagamento do saldo restante e fecha a comanda numa só ação. */
export async function payAndCloseOrder(input: {
  orderId: string;
  method: string;
}): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    if (input.method === "client_account") {
      const db = createDb();
      await db.transaction(async (tx) => {
        const state = await lockOrderFinancialState(
          tx,
          input.orderId,
          tenant.id
        );
        if (state.packageCount > 0) {
          throw new AppError(
            "VALIDATION",
            "Conta do Cliente não está disponível para venda de pacote"
          );
        }
        if (state.itemCount === 0) {
          throw new AppError("VALIDATION", "Adicione ao menos um item antes de fechar");
        }
        if (!state.clientId) {
          throw new AppError("VALIDATION", "Vincule um cliente para usar a Conta do Cliente");
        }
        if (state.balanceCents <= 0) {
          throw new AppError("VALIDATION", "A comanda não possui saldo a pagar");
        }

        const [client] = await tx
          .select({ accountBalanceCents: schema.clients.accountBalanceCents })
          .from(schema.clients)
          .where(
            and(
              eq(schema.clients.id, state.clientId),
              eq(schema.clients.tenantId, tenant.id)
            )
          )
          .for("update");
        if (!client || client.accountBalanceCents < state.balanceCents) {
          throw new AppError(
            "VALIDATION",
            "O crédito da Conta do Cliente não cobre o saldo total"
          );
        }

        const [payment] = await tx
          .insert(schema.payments)
          .values({
            tenantId: tenant.id,
            orderId: input.orderId,
            method: "client_account",
            amountCents: state.balanceCents,
          })
          .returning({ id: schema.payments.id });

        await applyClientAccountDeltaTx(tx, {
          tenantId: tenant.id,
          clientId: state.clientId,
          deltaCents: -state.balanceCents,
          reason: "order_payment",
          notes: "Pagamento com crédito da conta",
          orderId: input.orderId,
          paymentId: payment.id,
          createdByUserId: session.user.id,
        });

        const [updated] = await tx
          .update(schema.orders)
          .set({
            status: "closed",
            closedAt: new Date(),
            closedByUserId: session.user.id,
            meta: {
              ...((state.meta ?? {}) as Record<string, unknown>),
              clientAccountDebtCents: 0,
              clientAccountSettlementCents: state.balanceCents,
              clientAccountPaymentId: payment.id,
              clientAccountClientId: state.clientId,
            },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.orders.id, input.orderId),
              eq(schema.orders.tenantId, tenant.id),
              eq(schema.orders.status, "open")
            )
          )
          .returning({ appointmentId: schema.orders.appointmentId });
        if (!updated) {
          throw new AppError("CONFLICT", "A comanda já foi fechada por outra operação");
        }

        if (updated.appointmentId) {
          await tx
            .update(schema.appointments)
            .set({ status: "completed", updatedAt: new Date() })
            .where(
              and(
                eq(schema.appointments.id, updated.appointmentId),
                eq(schema.appointments.tenantId, tenant.id)
              )
            );
        }
      });

      return { ok: true, id: input.orderId };
    }

    if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) {
      throw new AppError("VALIDATION", "Forma de pagamento inválida");
    }
    const method = input.method as PaymentMethod;
    const db = createDb();
    await db.transaction(async (tx) => {
      const state = await lockOrderFinancialState(
        tx,
        input.orderId,
        tenant.id
      );
      if (state.itemCount === 0) {
        throw new AppError("VALIDATION", "Adicione ao menos um item antes de fechar");
      }

      if (state.balanceCents > 0) {
        await tx.insert(schema.payments).values({
          tenantId: tenant.id,
          orderId: input.orderId,
          method,
          amountCents: state.balanceCents,
        });
        const { recordPaymentInCashTx } = await import("../finance/mutations");
        await recordPaymentInCashTx(tx, {
          tenantId: tenant.id,
          orderId: input.orderId,
          method,
          amountCents: state.balanceCents,
        });
      }

      if (state.clientId) {
        const { activateClientPackagesForOrder } = await import("../packages/credits");
        await activateClientPackagesForOrder(
          {
            tenantId: tenant.id,
            orderId: input.orderId,
            clientId: state.clientId,
          },
          tx
        );
      }

      const [updated] = await tx
        .update(schema.orders)
        .set({
          status: "closed",
          closedAt: new Date(),
          closedByUserId: session.user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orders.id, input.orderId),
            eq(schema.orders.tenantId, tenant.id),
            eq(schema.orders.status, "open")
          )
        )
        .returning({ appointmentId: schema.orders.appointmentId });
      if (!updated) {
        throw new AppError("CONFLICT", "A comanda já foi fechada por outra operação");
      }
      if (updated.appointmentId) {
        await tx
          .update(schema.appointments)
          .set({ status: "completed", updatedAt: new Date() })
          .where(
            and(
              eq(schema.appointments.id, updated.appointmentId),
              eq(schema.appointments.tenantId, tenant.id)
            )
          );
      }
    });
    return { ok: true, id: input.orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível pagar e fechar" };
  }
}

/**
 * Lança o restante da comanda como débito na Conta do Cliente e fecha.
 * Se o cliente tem crédito, consome o crédito; o que faltar vira saldo negativo (fiado).
 */
export async function closeOrderToClientAccount(orderId: string): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    const db = createDb();
    await db.transaction(async (tx) => {
      const state = await lockOrderFinancialState(tx, orderId, tenant.id);
      if (state.packageCount > 0) {
        throw new AppError(
          "VALIDATION",
          "Conta do Cliente não está disponível para venda de pacote"
        );
      }
      if (state.itemCount === 0) {
        throw new AppError("VALIDATION", "Adicione ao menos um item antes de fechar");
      }
      if (!state.clientId) {
        throw new AppError("VALIDATION", "Vincule um cliente para lançar na Conta do Cliente");
      }

      let paymentId: string | null = null;
      let debtCents = 0;
      if (state.balanceCents > 0) {
        const [client] = await tx
          .select({ accountBalanceCents: schema.clients.accountBalanceCents })
          .from(schema.clients)
          .where(
            and(
              eq(schema.clients.id, state.clientId),
              eq(schema.clients.tenantId, tenant.id)
            )
          )
          .for("update");
        if (!client) throw new AppError("NOT_FOUND", "Cliente não encontrado");

        const settlement = calculateAccountSettlement(
          state.balanceCents,
          client.accountBalanceCents
        );
        const { creditAppliedCents } = settlement;
        debtCents = settlement.debtCents;

        if (creditAppliedCents > 0) {
          const [payment] = await tx
            .insert(schema.payments)
            .values({
              tenantId: tenant.id,
              orderId,
              method: "client_account",
              amountCents: creditAppliedCents,
            })
            .returning({ id: schema.payments.id });
          paymentId = payment.id;
        }

        await applyClientAccountDeltaTx(tx, {
          tenantId: tenant.id,
          clientId: state.clientId,
          deltaCents: settlement.accountDeltaCents,
          reason: "order_debt",
          notes: "Restante da comanda lançado na conta",
          orderId,
          paymentId,
          createdByUserId: session.user.id,
        });
      }

      const prevMeta = (state.meta ?? {}) as Record<string, unknown>;
      const [updated] = await tx
        .update(schema.orders)
        .set({
          status: "closed",
          closedAt: new Date(),
          closedByUserId: session.user.id,
          meta: {
            ...prevMeta,
            clientAccountDebtCents: debtCents,
            clientAccountSettlementCents: Math.max(0, state.balanceCents),
            clientAccountPaymentId: paymentId,
            clientAccountClientId: state.clientId,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orders.id, orderId),
            eq(schema.orders.tenantId, tenant.id),
            eq(schema.orders.status, "open")
          )
        )
        .returning({ appointmentId: schema.orders.appointmentId });
      if (!updated) {
        throw new AppError("CONFLICT", "A comanda já foi fechada por outra operação");
      }

      if (updated.appointmentId) {
        await tx
          .update(schema.appointments)
          .set({ status: "completed", updatedAt: new Date() })
          .where(
            and(
              eq(schema.appointments.id, updated.appointmentId),
              eq(schema.appointments.tenantId, tenant.id)
            )
          );
      }

    });

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível lançar na conta e fechar" };
  }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    await assertOpenOrder(orderId, tenant.id);

    const detail = await getOrderDetail(orderId);
    if (detail.paidCents > 0) {
      throw new AppError(
        "VALIDATION",
        "Comanda com pagamentos não pode ser cancelada. Remova os pagamentos ou feche."
      );
    }

    const db = createDb();

    const orderItems = await db
      .select({
        id: schema.orderItems.id,
        meta: schema.orderItems.meta,
      })
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.orderId, orderId),
          eq(schema.orderItems.tenantId, tenant.id)
        )
      );

    const { cancelClientPackageSale } = await import("../packages/credits");
    for (const item of orderItems) {
      const meta = (item.meta ?? {}) as Record<string, unknown>;
      if (meta.packageSale && typeof meta.clientPackageId === "string") {
        try {
          await cancelClientPackageSale({
            tenantId: tenant.id,
            clientPackageId: meta.clientPackageId,
          });
        } catch {
          throw new AppError(
            "VALIDATION",
            "Há pacote com crédito já usado nesta comanda — não dá para cancelar"
          );
        }
      }
    }

    await db
      .update(schema.orders)
      .set({
        status: "cancelled",
        closedAt: new Date(),
        closedByUserId: session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));

    return { ok: true, id: orderId };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível cancelar a comanda" };
  }
}
