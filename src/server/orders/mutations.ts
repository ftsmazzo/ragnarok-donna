import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { isBarberRole, isOwnerRole } from "../permissions/roles";
import { resolveSessionStaffId } from "../permissions/staff-scope";
import { assertOwnOrderAccess, getOrderDetail } from "./queries";

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
  "other",
] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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

export async function addOrderItem(input: {
  orderId: string;
  itemType: "service" | "product" | "package";
  catalogId: string;
  staffId?: string;
  qty?: number;
  discountCents?: number;
  /** Usar crédito de pacote (serviço a R$ 0; comissão no preço de tabela). */
  usePackageCredit?: boolean;
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
    let totalCents = lineGross - appliedDiscount;
    let meta: Record<string, unknown> = {};
    let useCredit = Boolean(input.usePackageCredit && input.itemType === "service" && serviceId);

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

      const {
        debitOneCredit,
      } = await import("../packages/credits");
      const debit = await debitOneCredit({
        tenantId: tenant.id,
        clientId: orderRow.clientId,
        serviceId: serviceId!,
      });
      appliedDiscount = lineGross;
      totalCents = 0;
      meta = {
        redeemed: true,
        creditId: debit.creditId,
        clientPackageId: debit.clientPackageId,
      };
      description = `${description} · Pacote`;
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

  const { normalizePackageItems, createClientPackageFromSale, resolvePackageServiceItems } =
    await import("../packages/credits");
  const { items } = await resolvePackageServiceItems(input.tenantId, pkg.items, {
    healPackageId: pkg.id,
  });
  if (items.length === 0) {
    throw new AppError(
      "VALIDATION",
      "Configure os serviços deste pacote em Cadastros → Pacotes"
    );
  }

  let staffId: string | null = input.staffId || null;
  if (staffId) {
    const [st] = await db
      .select({ id: schema.staff.id })
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
  }

  const [row] = await db
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
      commissionBps: null,
      commissionCents: null,
      performedAt: new Date(),
      meta: { packageSale: true },
    })
    .returning({ id: schema.orderItems.id });

  const clientPackageId = await createClientPackageFromSale({
    tenantId: input.tenantId,
    clientId: orderRow.clientId,
    packageId: pkg.id,
    orderId: input.orderId,
    orderItemId: row.id,
    packageName: pkg.name,
    expiresAfterDays: pkg.expiresAfterDays,
    items,
  });

  await db
    .update(schema.orderItems)
    .set({
      meta: { packageSale: true, clientPackageId },
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.orderItems.id, row.id), eq(schema.orderItems.tenantId, input.tenantId))
    );

  await recalculateOrderTotal(input.orderId, input.tenantId);
  return { ok: true, id: row.id };
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
    await assertFullOrderWrite();
    const tenant = await requireTenantContext();
    await assertOpenOrder(input.orderId, tenant.id);

    if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) {
      throw new AppError("VALIDATION", "Forma de pagamento inválida");
    }
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
      throw new AppError("VALIDATION", "Valor do pagamento inválido");
    }

    const detail = await getOrderDetail(input.orderId);
    if (input.amountCents > detail.balanceCents + 1) {
      const resto = (detail.balanceCents / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      throw new AppError("VALIDATION", `Valor excede o saldo (restante ${resto})`);
    }

    const db = createDb();
    const [row] = await db
      .insert(schema.payments)
      .values({
        tenantId: tenant.id,
        orderId: input.orderId,
        method: input.method as PaymentMethod,
        amountCents: Math.round(input.amountCents),
      })
      .returning({ id: schema.payments.id });

    const { recordPaymentInCash } = await import("../finance/mutations");
    await recordPaymentInCash({
      tenantId: tenant.id,
      orderId: input.orderId,
      method: input.method as PaymentMethod,
      amountCents: Math.round(input.amountCents),
    });

    return { ok: true, id: row.id };
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
    const order = await assertOpenOrder(orderId, tenant.id);

    const d = Math.max(0, Math.round(discountCents));
    if (d > order.totalCents) {
      throw new AppError("VALIDATION", "Desconto maior que o total da comanda");
    }

    const db = createDb();
    await db
      .update(schema.orders)
      .set({ discountCents: d, updatedAt: new Date() })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));

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

/** Reabre comanda fechada (owner/admin). Não apaga pagamentos já lançados. */
export async function reopenOrder(orderId: string): Promise<ActionResult> {
  try {
    const session = await assertFullOrderWrite();
    if (!isOwnerRole(session.role)) {
      throw new ForbiddenError("Só dono/admin pode reabrir comanda");
    }
    const tenant = await requireTenantContext();
    const db = createDb();

    const [order] = await db
      .select({
        id: schema.orders.id,
        status: schema.orders.status,
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
      .limit(1);

    if (!order) throw new AppError("NOT_FOUND", "Comanda não encontrada");
    if (order.status !== "closed") {
      throw new AppError("VALIDATION", "Só é possível reabrir comanda fechada");
    }

    const prevMeta = (order.meta ?? {}) as Record<string, unknown>;
    await db
      .update(schema.orders)
      .set({
        status: "open",
        closedAt: null,
        closedByUserId: null,
        meta: {
          ...prevMeta,
          reopenedAt: new Date().toISOString(),
          reopenedBy: session.user.id,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id)));

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
    await assertFullOrderWrite();
    const detail = await getOrderDetail(input.orderId);
    if (detail.items.length === 0) {
      throw new AppError("VALIDATION", "Adicione ao menos um item antes de fechar");
    }
    if (detail.balanceCents > 0) {
      const pay = await addPayment({
        orderId: input.orderId,
        method: input.method,
        amountCents: detail.balanceCents,
      });
      if (!pay.ok) return pay;
    }
    return await closeOrder(input.orderId);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    return { ok: false, error: "Não foi possível pagar e fechar" };
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
