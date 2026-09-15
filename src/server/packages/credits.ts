import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";

export type ClientCreditBalance = {
  creditId: string;
  clientPackageId: string;
  packageName: string;
  serviceId: string | null;
  serviceName: string | null;
  productId: string | null;
  productName: string | null;
  remainingQty: number;
  expiresAt: Date | null;
};

export type CatalogPackage = {
  id: string;
  name: string;
  priceCents: number;
  expiresAfterDays: number | null;
  commissionBps: number | null;
  items: Array<{
    serviceId?: string;
    serviceName?: string;
    productId?: string;
    productName?: string;
    qty: number;
  }>;
};

type PackageItem = {
  serviceId?: string;
  productId?: string;
  serviceExternalId?: string;
  productExternalId?: string;
  qty: number;
  description?: string;
  valueCents?: number;
};

export function normalizePackageItems(raw: unknown): PackageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const serviceId =
        row.serviceId != null && String(row.serviceId).trim()
          ? String(row.serviceId)
          : undefined;
      const productId =
        row.productId != null && String(row.productId).trim()
          ? String(row.productId)
          : undefined;
      const serviceExternalId =
        row.serviceExternalId != null && String(row.serviceExternalId).trim()
          ? String(row.serviceExternalId)
          : undefined;
      const productExternalId =
        row.productExternalId != null && String(row.productExternalId).trim()
          ? String(row.productExternalId)
          : undefined;
      return {
        serviceId,
        productId,
        serviceExternalId,
        productExternalId,
        qty: Math.max(1, Number(row.qty) || 1),
        description: row.description != null ? String(row.description) : undefined,
        valueCents:
          row.valueCents != null && Number.isFinite(Number(row.valueCents))
            ? Number(row.valueCents)
            : undefined,
      };
    })
    .filter((i) =>
      Boolean(i.serviceId || i.productId || i.serviceExternalId || i.productExternalId)
    );
}

/** Resolve externalIds → serviceId/productId e opcionalmente persiste no pacote. */
export async function resolvePackageServiceItems(
  tenantId: string,
  rawItems: unknown,
  opts?: { healPackageId?: string }
): Promise<{
  items: Array<{ serviceId?: string; productId?: string; qty: number }>;
  serviceItems: Array<{ serviceId: string; qty: number }>;
  productItems: Array<{ productId: string; qty: number }>;
  unresolvedCount: number;
  healed: boolean;
  lines: Array<{
    serviceId?: string;
    productId?: string;
    serviceExternalId?: string;
    productExternalId?: string;
    qty: number;
  }>;
}> {
  const db = createDb();
  const normalized = normalizePackageItems(rawItems);
  const serviceExternalIds = [
    ...new Set(
      normalized
        .filter((i) => !i.serviceId && i.serviceExternalId)
        .map((i) => String(i.serviceExternalId))
    ),
  ];
  const productExternalIds = [
    ...new Set(
      normalized
        .filter((i) => !i.productId && i.productExternalId)
        .map((i) => String(i.productExternalId))
    ),
  ];

  const serviceByExternal = new Map<string, string>();
  if (serviceExternalIds.length > 0) {
    const rows = await db
      .select({ id: schema.services.id, externalId: schema.services.externalId })
      .from(schema.services)
      .where(
        and(
          eq(schema.services.tenantId, tenantId),
          isNull(schema.services.deletedAt),
          inArray(schema.services.externalId, serviceExternalIds)
        )
      );
    for (const r of rows) {
      if (r.externalId) serviceByExternal.set(String(r.externalId), r.id);
    }
  }

  const productByExternal = new Map<string, string>();
  if (productExternalIds.length > 0) {
    const rows = await db
      .select({ id: schema.products.id, externalId: schema.products.externalId })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, tenantId),
          isNull(schema.products.deletedAt),
          inArray(schema.products.externalId, productExternalIds)
        )
      );
    for (const r of rows) {
      if (r.externalId) productByExternal.set(String(r.externalId), r.id);
    }
  }

  let healed = false;
  const mapped = normalized.map((i) => {
    let serviceId = i.serviceId;
    let productId = i.productId;
    if (!serviceId && i.serviceExternalId) {
      const resolved = serviceByExternal.get(String(i.serviceExternalId));
      if (resolved) {
        serviceId = resolved;
        healed = true;
      }
    }
    if (!productId && i.productExternalId) {
      const resolved = productByExternal.get(String(i.productExternalId));
      if (resolved) {
        productId = resolved;
        healed = true;
      }
    }
    return { ...i, serviceId, productId };
  });

  const serviceItems: Array<{ serviceId: string; qty: number }> = [];
  const productItems: Array<{ productId: string; qty: number }> = [];
  for (const i of mapped) {
    if (i.serviceId) {
      serviceItems.push({ serviceId: i.serviceId, qty: i.qty });
    } else if (i.productId) {
      productItems.push({ productId: i.productId, qty: i.qty });
    }
  }
  const items = [
    ...serviceItems.map((i) => ({ serviceId: i.serviceId, qty: i.qty })),
    ...productItems.map((i) => ({ productId: i.productId, qty: i.qty })),
  ];

  const unresolvedCount = mapped.filter(
    (i) =>
      !i.serviceId &&
      !i.productId &&
      Boolean(i.serviceExternalId || i.productExternalId)
  ).length;

  if (opts?.healPackageId && healed) {
    const healedJson = mapped.map((i) => ({
      qty: i.qty,
      ...(i.serviceId ? { serviceId: i.serviceId } : {}),
      ...(i.serviceExternalId ? { serviceExternalId: i.serviceExternalId } : {}),
      ...(i.productId ? { productId: i.productId } : {}),
      ...(i.productExternalId ? { productExternalId: i.productExternalId } : {}),
      ...(i.description ? { description: i.description } : {}),
      ...(i.valueCents != null ? { valueCents: i.valueCents } : {}),
    }));
    await db
      .update(schema.packages)
      .set({ items: healedJson, updatedAt: new Date() })
      .where(
        and(
          eq(schema.packages.id, opts.healPackageId),
          eq(schema.packages.tenantId, tenantId)
        )
      );
  }

  return {
    items,
    serviceItems,
    productItems,
    unresolvedCount,
    healed,
    lines: mapped.map((i) => ({
      serviceId: i.serviceId,
      productId: i.productId,
      serviceExternalId: i.serviceExternalId,
      productExternalId: i.productExternalId,
      qty: i.qty,
    })),
  };
}

export async function listCatalogPackages(): Promise<CatalogPackage[]> {
  const { requireTenantContext } = await import("../context/tenant");
  const tenant = await requireTenantContext();
  const db = createDb();

  const rows = await db
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
        eq(schema.packages.tenantId, tenant.id),
        eq(schema.packages.isActive, true),
        isNull(schema.packages.deletedAt)
      )
    )
    .orderBy(asc(schema.packages.name));

  const resolvedRows = await Promise.all(
    rows.map(async (row) => {
      const resolved = await resolvePackageServiceItems(tenant.id, row.items, {
        healPackageId: row.id,
      });
      return { row, resolved };
    })
  );

  const serviceIds = new Set<string>();
  const productIds = new Set<string>();
  for (const { resolved } of resolvedRows) {
    for (const item of resolved.serviceItems) serviceIds.add(item.serviceId);
    for (const item of resolved.productItems) productIds.add(item.productId);
  }

  const [services, products] = await Promise.all([
    serviceIds.size === 0
      ? Promise.resolve([] as Array<{ id: string; name: string }>)
      : db
          .select({ id: schema.services.id, name: schema.services.name })
          .from(schema.services)
          .where(
            and(
              eq(schema.services.tenantId, tenant.id),
              isNull(schema.services.deletedAt),
              inArray(schema.services.id, [...serviceIds])
            )
          ),
    productIds.size === 0
      ? Promise.resolve([] as Array<{ id: string; name: string }>)
      : db
          .select({ id: schema.products.id, name: schema.products.name })
          .from(schema.products)
          .where(
            and(
              eq(schema.products.tenantId, tenant.id),
              isNull(schema.products.deletedAt),
              inArray(schema.products.id, [...productIds])
            )
          ),
  ]);

  const serviceNameById = new Map(services.map((s) => [s.id, s.name]));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  return resolvedRows
    .map(({ row, resolved }) => ({
      id: row.id,
      name: row.name,
      priceCents: row.priceCents,
      expiresAfterDays: row.expiresAfterDays,
      commissionBps: row.commissionBps,
      items: [
        ...resolved.serviceItems.map((i) => ({
          serviceId: i.serviceId,
          serviceName: serviceNameById.get(i.serviceId) ?? "Serviço",
          qty: i.qty,
        })),
        ...resolved.productItems.map((i) => ({
          productId: i.productId,
          productName: productNameById.get(i.productId) ?? "Produto",
          qty: i.qty,
        })),
      ],
    }))
    .filter((p) => p.items.length > 0);
}

export async function listClientCredits(clientId: string): Promise<ClientCreditBalance[]> {
  const { requireTenantContext } = await import("../context/tenant");
  const tenant = await requireTenantContext();
  const db = createDb();
  const now = new Date();

  const rows = await db
    .select({
      creditId: schema.clientPackageCredits.id,
      clientPackageId: schema.clientPackages.id,
      packageName: schema.clientPackages.name,
      serviceId: schema.clientPackageCredits.serviceId,
      serviceName: schema.services.name,
      productId: schema.clientPackageCredits.productId,
      productName: schema.products.name,
      remainingQty: schema.clientPackageCredits.remainingQty,
      expiresAt: schema.clientPackages.expiresAt,
    })
    .from(schema.clientPackageCredits)
    .innerJoin(
      schema.clientPackages,
      eq(schema.clientPackageCredits.clientPackageId, schema.clientPackages.id)
    )
    .leftJoin(
      schema.services,
      eq(schema.clientPackageCredits.serviceId, schema.services.id)
    )
    .leftJoin(
      schema.products,
      eq(schema.clientPackageCredits.productId, schema.products.id)
    )
    .where(
      and(
        eq(schema.clientPackageCredits.tenantId, tenant.id),
        eq(schema.clientPackages.clientId, clientId),
        eq(schema.clientPackages.status, "active"),
        gt(schema.clientPackageCredits.remainingQty, 0),
        or(
          isNull(schema.clientPackages.expiresAt),
          gt(schema.clientPackages.expiresAt, now)
        )
      )
    )
    .orderBy(asc(schema.clientPackages.expiresAt));

  return rows.map((r) => ({
    creditId: r.creditId,
    clientPackageId: r.clientPackageId,
    packageName: r.packageName,
    serviceId: r.serviceId,
    serviceName: r.serviceName,
    productId: r.productId,
    productName: r.productName,
    remainingQty: r.remainingQty,
    expiresAt: r.expiresAt,
  }));
}

export async function remainingCreditsForService(
  tenantId: string,
  clientId: string,
  serviceId: string
): Promise<number> {
  const db = createDb();
  const now = new Date();
  const [row] = await db
    .select({
      qty: sql<number>`coalesce(sum(${schema.clientPackageCredits.remainingQty}), 0)::int`,
    })
    .from(schema.clientPackageCredits)
    .innerJoin(
      schema.clientPackages,
      eq(schema.clientPackageCredits.clientPackageId, schema.clientPackages.id)
    )
    .where(
      and(
        eq(schema.clientPackageCredits.tenantId, tenantId),
        eq(schema.clientPackages.clientId, clientId),
        eq(schema.clientPackageCredits.serviceId, serviceId),
        eq(schema.clientPackages.status, "active"),
        or(
          isNull(schema.clientPackages.expiresAt),
          gt(schema.clientPackages.expiresAt, now)
        )
      )
    );
  return Number(row?.qty ?? 0);
}

/** Debita 1 crédito (FIFO por validade). Retorna ids usados. */
export async function debitOneCredit(input: {
  tenantId: string;
  clientId: string;
  serviceId?: string;
  productId?: string;
}): Promise<{ creditId: string; clientPackageId: string }> {
  const db = createDb();
  const now = new Date();
  if (!input.serviceId && !input.productId) {
    const { AppError } = await import("../errors");
    throw new AppError("VALIDATION", "Informe serviço ou produto para abater crédito");
  }

  const [credit] = await db
    .select({
      id: schema.clientPackageCredits.id,
      clientPackageId: schema.clientPackageCredits.clientPackageId,
      remainingQty: schema.clientPackageCredits.remainingQty,
    })
    .from(schema.clientPackageCredits)
    .innerJoin(
      schema.clientPackages,
      eq(schema.clientPackageCredits.clientPackageId, schema.clientPackages.id)
    )
    .where(
      and(
        eq(schema.clientPackageCredits.tenantId, input.tenantId),
        eq(schema.clientPackages.clientId, input.clientId),
        input.serviceId
          ? eq(schema.clientPackageCredits.serviceId, input.serviceId)
          : eq(schema.clientPackageCredits.productId, input.productId!),
        eq(schema.clientPackages.status, "active"),
        gt(schema.clientPackageCredits.remainingQty, 0),
        or(
          isNull(schema.clientPackages.expiresAt),
          gt(schema.clientPackages.expiresAt, now)
        )
      )
    )
    .orderBy(
      sql`${schema.clientPackages.expiresAt} asc nulls last`,
      asc(schema.clientPackageCredits.createdAt)
    )
    .limit(1);

  if (!credit) {
    const { AppError } = await import("../errors");
    throw new AppError(
      "VALIDATION",
      input.serviceId
        ? "Cliente sem crédito disponível para este serviço"
        : "Cliente sem crédito disponível para este produto"
    );
  }

  await db
    .update(schema.clientPackageCredits)
    .set({
      remainingQty: credit.remainingQty - 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.clientPackageCredits.id, credit.id),
        eq(schema.clientPackageCredits.tenantId, input.tenantId),
        gt(schema.clientPackageCredits.remainingQty, 0)
      )
    );

  const [left] = await db
    .select({
      qty: sql<number>`coalesce(sum(${schema.clientPackageCredits.remainingQty}), 0)::int`,
    })
    .from(schema.clientPackageCredits)
    .where(
      and(
        eq(schema.clientPackageCredits.clientPackageId, credit.clientPackageId),
        eq(schema.clientPackageCredits.tenantId, input.tenantId)
      )
    );

  if (Number(left?.qty ?? 0) <= 0) {
    await db
      .update(schema.clientPackages)
      .set({ status: "exhausted", updatedAt: now })
      .where(
        and(
          eq(schema.clientPackages.id, credit.clientPackageId),
          eq(schema.clientPackages.tenantId, input.tenantId)
        )
      );
  }

  return { creditId: credit.id, clientPackageId: credit.clientPackageId };
}

export async function restoreOneCredit(input: {
  tenantId: string;
  creditId: string;
  clientPackageId: string;
}) {
  const db = createDb();
  const now = new Date();
  await db
    .update(schema.clientPackageCredits)
    .set({
      remainingQty: sql`${schema.clientPackageCredits.remainingQty} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.clientPackageCredits.id, input.creditId),
        eq(schema.clientPackageCredits.tenantId, input.tenantId),
        lte(
          schema.clientPackageCredits.remainingQty,
          sql`${schema.clientPackageCredits.totalQty}`
        )
      )
    );

  await db
    .update(schema.clientPackages)
    .set({ status: "active", updatedAt: now })
    .where(
      and(
        eq(schema.clientPackages.id, input.clientPackageId),
        eq(schema.clientPackages.tenantId, input.tenantId)
      )
    );
}

export async function createClientPackageFromSale(input: {
  tenantId: string;
  clientId: string;
  packageId: string;
  orderId: string;
  orderItemId: string;
  packageName: string;
  expiresAfterDays: number | null;
  items: Array<{ serviceId?: string; productId?: string; qty: number }>;
}): Promise<string> {
  const db = createDb();
  const now = new Date();
  const expiresAt =
    input.expiresAfterDays && input.expiresAfterDays > 0
      ? new Date(now.getTime() + input.expiresAfterDays * 24 * 60 * 60 * 1000)
      : null;

  const creditRows = input.items
    .filter((item) => item.serviceId || item.productId)
    .map((item) => ({
      tenantId: input.tenantId,
      clientPackageId: "" as string,
      serviceId: item.serviceId ?? null,
      productId: item.productId ?? null,
      totalQty: item.qty,
      remainingQty: item.qty,
    }));

  if (creditRows.length === 0) {
    const { AppError } = await import("../errors");
    throw new AppError("VALIDATION", "Pacote sem itens de crédito para liberar");
  }

  const [pkg] = await db
    .insert(schema.clientPackages)
    .values({
      tenantId: input.tenantId,
      clientId: input.clientId,
      packageId: input.packageId,
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      name: input.packageName,
      status: "active",
      purchasedAt: now,
      expiresAt,
    })
    .returning({ id: schema.clientPackages.id });

  await db.insert(schema.clientPackageCredits).values(
    creditRows.map((row) => ({
      ...row,
      clientPackageId: pkg.id,
    }))
  );

  return pkg.id;
}

/** Libera carteiras de vendas de pacote desta comanda (chamar ao fechar/pagar). */
export async function activateClientPackagesForOrder(input: {
  tenantId: string;
  orderId: string;
  clientId: string;
}): Promise<number> {
  const db = createDb();
  const items = await db
    .select({
      id: schema.orderItems.id,
      packageId: schema.orderItems.packageId,
      meta: schema.orderItems.meta,
    })
    .from(schema.orderItems)
    .where(
      and(
        eq(schema.orderItems.tenantId, input.tenantId),
        eq(schema.orderItems.orderId, input.orderId),
        eq(schema.orderItems.itemType, "package")
      )
    );

  let activated = 0;
  for (const item of items) {
    const meta = (item.meta ?? {}) as Record<string, unknown>;
    if (!meta.packageSale) continue;
    if (typeof meta.clientPackageId === "string" && meta.clientPackageId) continue;
    if (!item.packageId) continue;

    const [pkg] = await db
      .select({
        id: schema.packages.id,
        name: schema.packages.name,
        expiresAfterDays: schema.packages.expiresAfterDays,
        items: schema.packages.items,
      })
      .from(schema.packages)
      .where(
        and(
          eq(schema.packages.id, item.packageId),
          eq(schema.packages.tenantId, input.tenantId)
        )
      )
      .limit(1);
    if (!pkg) continue;

    const { items: creditItems } = await resolvePackageServiceItems(
      input.tenantId,
      pkg.items,
      { healPackageId: pkg.id }
    );
    if (creditItems.length === 0) continue;

    const clientPackageId = await createClientPackageFromSale({
      tenantId: input.tenantId,
      clientId: input.clientId,
      packageId: pkg.id,
      orderId: input.orderId,
      orderItemId: item.id,
      packageName: pkg.name,
      expiresAfterDays: pkg.expiresAfterDays,
      items: creditItems,
    });

    await db
      .update(schema.orderItems)
      .set({
        meta: { ...meta, packageSale: true, clientPackageId },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.orderItems.id, item.id),
          eq(schema.orderItems.tenantId, input.tenantId)
        )
      );
    activated += 1;
  }

  return activated;
}

export async function cancelClientPackageSale(input: {
  tenantId: string;
  clientPackageId: string;
}) {
  const db = createDb();
  const now = new Date();

  const credits = await db
    .select({
      remainingQty: schema.clientPackageCredits.remainingQty,
      totalQty: schema.clientPackageCredits.totalQty,
    })
    .from(schema.clientPackageCredits)
    .where(
      and(
        eq(schema.clientPackageCredits.clientPackageId, input.clientPackageId),
        eq(schema.clientPackageCredits.tenantId, input.tenantId)
      )
    );

  const used = credits.some((c) => c.remainingQty < c.totalQty);
  if (used) {
    const { AppError } = await import("../errors");
    throw new AppError(
      "VALIDATION",
      "Não dá para remover: já houve uso de crédito deste pacote"
    );
  }

  await db
    .delete(schema.clientPackageCredits)
    .where(
      and(
        eq(schema.clientPackageCredits.clientPackageId, input.clientPackageId),
        eq(schema.clientPackageCredits.tenantId, input.tenantId)
      )
    );

  await db
    .update(schema.clientPackages)
    .set({ status: "cancelled", updatedAt: now })
    .where(
      and(
        eq(schema.clientPackages.id, input.clientPackageId),
        eq(schema.clientPackages.tenantId, input.tenantId)
      )
    );
}

export type ClientPackageWalletEntry = {
  clientPackageId: string;
  packageId: string | null;
  packageName: string;
  status: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  credits: Array<{
    creditId: string;
    serviceId: string | null;
    serviceName: string | null;
    productId: string | null;
    productName: string | null;
    totalQty: number;
    remainingQty: number;
  }>;
  recentRedemptions: Array<{
    orderItemId: string;
    description: string;
    performedAt: Date | null;
    orderId: string;
  }>;
};

/** Carteira completa do cliente (ativos, esgotados e últimos usos). */
export async function listClientPackageWallet(
  clientId: string
): Promise<ClientPackageWalletEntry[]> {
  const { requireTenantContext } = await import("../context/tenant");
  const tenant = await requireTenantContext();
  const db = createDb();

  const pkgs = await db
    .select({
      id: schema.clientPackages.id,
      packageId: schema.clientPackages.packageId,
      name: schema.clientPackages.name,
      status: schema.clientPackages.status,
      purchasedAt: schema.clientPackages.purchasedAt,
      expiresAt: schema.clientPackages.expiresAt,
    })
    .from(schema.clientPackages)
    .where(
      and(
        eq(schema.clientPackages.tenantId, tenant.id),
        eq(schema.clientPackages.clientId, clientId),
        ne(schema.clientPackages.status, "cancelled")
      )
    )
    .orderBy(desc(schema.clientPackages.purchasedAt));

  if (pkgs.length === 0) return [];

  const pkgIds = pkgs.map((p) => p.id);
  const creditRows = await db
    .select({
      creditId: schema.clientPackageCredits.id,
      clientPackageId: schema.clientPackageCredits.clientPackageId,
      serviceId: schema.clientPackageCredits.serviceId,
      serviceName: schema.services.name,
      productId: schema.clientPackageCredits.productId,
      productName: schema.products.name,
      totalQty: schema.clientPackageCredits.totalQty,
      remainingQty: schema.clientPackageCredits.remainingQty,
    })
    .from(schema.clientPackageCredits)
    .leftJoin(
      schema.services,
      eq(schema.clientPackageCredits.serviceId, schema.services.id)
    )
    .leftJoin(
      schema.products,
      eq(schema.clientPackageCredits.productId, schema.products.id)
    )
    .where(
      and(
        eq(schema.clientPackageCredits.tenantId, tenant.id),
        inArray(schema.clientPackageCredits.clientPackageId, pkgIds)
      )
    );

  const redemptionRows =
    pkgIds.length === 0
      ? []
      : await db
          .select({
            orderItemId: schema.orderItems.id,
            description: schema.orderItems.description,
            performedAt: schema.orderItems.performedAt,
            orderId: schema.orderItems.orderId,
            meta: schema.orderItems.meta,
          })
          .from(schema.orderItems)
          .where(
            and(
              eq(schema.orderItems.tenantId, tenant.id),
              sql`coalesce((${schema.orderItems.meta}->>'redeemed')::boolean, false) = true`,
              sql`(${schema.orderItems.meta}->>'clientPackageId') in (${sql.join(
                pkgIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
          )
          .orderBy(
            desc(sql`coalesce(${schema.orderItems.performedAt}, ${schema.orderItems.createdAt})`)
          )
          .limit(40);

  const creditsByPkg = new Map<string, ClientPackageWalletEntry["credits"]>();
  for (const c of creditRows) {
    const list = creditsByPkg.get(c.clientPackageId) ?? [];
    list.push({
      creditId: c.creditId,
      serviceId: c.serviceId,
      serviceName: c.serviceName,
      productId: c.productId,
      productName: c.productName,
      totalQty: c.totalQty,
      remainingQty: c.remainingQty,
    });
    creditsByPkg.set(c.clientPackageId, list);
  }

  const redemptionsByPkg = new Map<string, ClientPackageWalletEntry["recentRedemptions"]>();
  for (const r of redemptionRows) {
    const clientPackageId =
      r.meta && typeof r.meta === "object" && "clientPackageId" in r.meta
        ? String((r.meta as { clientPackageId?: unknown }).clientPackageId ?? "")
        : "";
    if (!clientPackageId) continue;
    const list = redemptionsByPkg.get(clientPackageId) ?? [];
    if (list.length >= 5) continue;
    list.push({
      orderItemId: r.orderItemId,
      description: r.description,
      performedAt: r.performedAt,
      orderId: r.orderId,
    });
    redemptionsByPkg.set(clientPackageId, list);
  }

  return pkgs.map((p) => ({
    clientPackageId: p.id,
    packageId: p.packageId,
    packageName: p.name,
    status: p.status,
    purchasedAt: p.purchasedAt,
    expiresAt: p.expiresAt,
    credits: creditsByPkg.get(p.id) ?? [],
    recentRedemptions: redemptionsByPkg.get(p.id) ?? [],
  }));
}

/** Repõe créditos somando a quantidade original em remaining/total e estende validade. */
export async function topUpClientPackageCredits(clientPackageId: string): Promise<{
  ok: true;
  id: string;
} | { ok: false; error: string }> {
  try {
    const { requireTenantContext, requireSession } = await import("../context/tenant");
    const { requireCapability } = await import("../permissions/guards");
    const session = await requireSession();
    requireCapability(session, "orders.write");
    const tenant = await requireTenantContext();
    const db = createDb();
    const now = new Date();

    const [pkg] = await db
      .select({
        id: schema.clientPackages.id,
        packageId: schema.clientPackages.packageId,
        expiresAt: schema.clientPackages.expiresAt,
      })
      .from(schema.clientPackages)
      .where(
        and(
          eq(schema.clientPackages.id, clientPackageId),
          eq(schema.clientPackages.tenantId, tenant.id)
        )
      )
      .limit(1);
    if (!pkg) {
      return { ok: false, error: "Pacote do cliente não encontrado" };
    }

    const credits = await db
      .select({
        id: schema.clientPackageCredits.id,
        totalQty: schema.clientPackageCredits.totalQty,
        remainingQty: schema.clientPackageCredits.remainingQty,
      })
      .from(schema.clientPackageCredits)
      .where(
        and(
          eq(schema.clientPackageCredits.clientPackageId, clientPackageId),
          eq(schema.clientPackageCredits.tenantId, tenant.id)
        )
      );

    if (credits.length === 0) {
      return { ok: false, error: "Pacote sem créditos para repor" };
    }

    for (const c of credits) {
      const add = Math.max(1, c.totalQty);
      await db
        .update(schema.clientPackageCredits)
        .set({
          remainingQty: c.remainingQty + add,
          totalQty: c.totalQty + add,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.clientPackageCredits.id, c.id),
            eq(schema.clientPackageCredits.tenantId, tenant.id)
          )
        );
    }

    let expiresAt = pkg.expiresAt;
    if (pkg.packageId) {
      const [catalog] = await db
        .select({ expiresAfterDays: schema.packages.expiresAfterDays })
        .from(schema.packages)
        .where(
          and(
            eq(schema.packages.id, pkg.packageId),
            eq(schema.packages.tenantId, tenant.id)
          )
        )
        .limit(1);
      if (catalog?.expiresAfterDays && catalog.expiresAfterDays > 0) {
        const base = Math.max(now.getTime(), pkg.expiresAt?.getTime() ?? now.getTime());
        expiresAt = new Date(base + catalog.expiresAfterDays * 24 * 60 * 60 * 1000);
      }
    }

    await db
      .update(schema.clientPackages)
      .set({ status: "active", expiresAt, updatedAt: now })
      .where(
        and(
          eq(schema.clientPackages.id, clientPackageId),
          eq(schema.clientPackages.tenantId, tenant.id)
        )
      );

    return { ok: true, id: clientPackageId };
  } catch (err) {
    const { AppError, ForbiddenError } = await import("../errors");
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível repor os créditos" };
  }
}
