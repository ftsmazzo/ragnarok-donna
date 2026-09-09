import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";

export type ClientCreditBalance = {
  creditId: string;
  clientPackageId: string;
  packageName: string;
  serviceId: string;
  serviceName: string;
  remainingQty: number;
  expiresAt: Date | null;
};

export type CatalogPackage = {
  id: string;
  name: string;
  priceCents: number;
  expiresAfterDays: number | null;
  items: Array<{ serviceId: string; serviceName: string; qty: number }>;
};

type PackageItem = { serviceId?: string; productId?: string; qty: number };

export function normalizePackageItems(raw: unknown): PackageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as PackageItem & {
        serviceExternalId?: string | null;
        qty?: number;
      };
      return {
        serviceId: row.serviceId || undefined,
        productId: row.productId || undefined,
        qty: Math.max(1, Number(row.qty) || 1),
      };
    })
    .filter((i) => Boolean(i.serviceId || i.productId));
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

  const serviceIds = new Set<string>();
  for (const row of rows) {
    for (const item of normalizePackageItems(row.items)) {
      if (item.serviceId) serviceIds.add(item.serviceId);
    }
  }

  const services =
    serviceIds.size === 0
      ? []
      : await db
          .select({ id: schema.services.id, name: schema.services.name })
          .from(schema.services)
          .where(
            and(
              eq(schema.services.tenantId, tenant.id),
              isNull(schema.services.deletedAt),
              inArray(schema.services.id, [...serviceIds])
            )
          );

  const nameById = new Map(services.map((s) => [s.id, s.name]));

  return rows
    .map((row) => {
      const items = normalizePackageItems(row.items)
        .filter((i): i is PackageItem & { serviceId: string } => Boolean(i.serviceId))
        .map((i) => ({
          serviceId: i.serviceId!,
          serviceName: nameById.get(i.serviceId!) ?? "Serviço",
          qty: i.qty,
        }));
      return {
        id: row.id,
        name: row.name,
        priceCents: row.priceCents,
        expiresAfterDays: row.expiresAfterDays,
        items,
      };
    })
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
      remainingQty: schema.clientPackageCredits.remainingQty,
      expiresAt: schema.clientPackages.expiresAt,
      status: schema.clientPackages.status,
    })
    .from(schema.clientPackageCredits)
    .innerJoin(
      schema.clientPackages,
      eq(schema.clientPackageCredits.clientPackageId, schema.clientPackages.id)
    )
    .innerJoin(
      schema.services,
      eq(schema.clientPackageCredits.serviceId, schema.services.id)
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
    .orderBy(asc(schema.services.name), asc(schema.clientPackages.expiresAt));

  return rows.map((r) => ({
    creditId: r.creditId,
    clientPackageId: r.clientPackageId,
    packageName: r.packageName,
    serviceId: r.serviceId,
    serviceName: r.serviceName,
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
  serviceId: string;
}): Promise<{ creditId: string; clientPackageId: string }> {
  const db = createDb();
  const now = new Date();

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
        eq(schema.clientPackageCredits.serviceId, input.serviceId),
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
    throw new AppError("VALIDATION", "Cliente sem crédito disponível para este serviço");
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
  items: Array<{ serviceId: string; qty: number }>;
}): Promise<string> {
  const db = createDb();
  const now = new Date();
  const expiresAt =
    input.expiresAfterDays && input.expiresAfterDays > 0
      ? new Date(now.getTime() + input.expiresAfterDays * 24 * 60 * 60 * 1000)
      : null;

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

  if (input.items.length > 0) {
    await db.insert(schema.clientPackageCredits).values(
      input.items.map((item) => ({
        tenantId: input.tenantId,
        clientPackageId: pkg.id,
        serviceId: item.serviceId,
        totalQty: item.qty,
        remainingQty: item.qty,
      }))
    );
  }

  return pkg.id;
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
