import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { requireCapability } from "../permissions/guards";
import { requireSession, requireTenantContext } from "../context/tenant";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

function moneyToCents(raw: string): number {
  const n = Number(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new AppError("VALIDATION", "Preço inválido");
  return Math.round(n * 100);
}

function pctToBps(raw?: string): number | null {
  const t = raw?.trim();
  if (!t) return null;
  const n = Number(String(t).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new AppError("VALIDATION", "Comissão inválida");
  return Math.round(n * 100);
}

async function assertCatalogWrite() {
  const session = await requireSession();
  requireCapability(session, "catalog.write");
  return session;
}

export async function createProduct(input: {
  name: string;
  category?: string;
  brand?: string;
  sku?: string;
  price: string;
  stockQty?: string;
  minQty?: string;
  forSale?: boolean;
  forInternalUse?: boolean;
}): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const name = input.name.trim();
    if (name.length < 2) throw new AppError("VALIDATION", "Nome obrigatório");
    const db = createDb();
    const [row] = await db
      .insert(schema.products)
      .values({
        tenantId: tenant.id,
        name: name.slice(0, 160),
        category: input.category?.trim().slice(0, 80) || null,
        brand: input.brand?.trim().slice(0, 80) || null,
        sku: input.sku?.trim().slice(0, 64) || null,
        priceCents: moneyToCents(input.price || "0"),
        stockQty: Math.max(0, Number(input.stockQty) || 0),
        minQty: Math.max(0, Number(input.minQty) || 0),
        forSale: input.forSale !== false,
        forInternalUse: Boolean(input.forInternalUse),
        isActive: true,
      })
      .returning({ id: schema.products.id });
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[createProduct]", err);
    return { ok: false, error: "Erro ao criar produto" };
  }
}

export async function updateProduct(
  id: string,
  input: {
    name: string;
    category?: string;
    brand?: string;
    sku?: string;
    price: string;
    stockQty?: string;
    minQty?: string;
    forSale?: boolean;
    forInternalUse?: boolean;
  }
): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const name = input.name.trim();
    if (name.length < 2) throw new AppError("VALIDATION", "Nome obrigatório");
    const db = createDb();
    const [row] = await db
      .update(schema.products)
      .set({
        name: name.slice(0, 160),
        category: input.category?.trim().slice(0, 80) || null,
        brand: input.brand?.trim().slice(0, 80) || null,
        sku: input.sku?.trim().slice(0, 64) || null,
        priceCents: moneyToCents(input.price || "0"),
        stockQty: Math.max(0, Number(input.stockQty) || 0),
        minQty: Math.max(0, Number(input.minQty) || 0),
        forSale: input.forSale !== false,
        forInternalUse: Boolean(input.forInternalUse),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.products.id, id),
          eq(schema.products.tenantId, tenant.id),
          isNull(schema.products.deletedAt)
        )
      )
      .returning({ id: schema.products.id });
    if (!row) throw new NotFoundError("Produto não encontrado");
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError || err instanceof NotFoundError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    return { ok: false, error: "Erro ao salvar produto" };
  }
}

/** Baixa estoque de produto marcado como uso interno (sem comanda/venda). */
export async function consumeInternalStock(input: {
  productId: string;
  qty?: number;
}): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const qty = Math.max(1, Math.min(999, input.qty ?? 1));
    const db = createDb();

    const [prod] = await db
      .select({
        id: schema.products.id,
        stockQty: schema.products.stockQty,
        forInternalUse: schema.products.forInternalUse,
      })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, input.productId),
          eq(schema.products.tenantId, tenant.id),
          isNull(schema.products.deletedAt)
        )
      )
      .limit(1);

    if (!prod) throw new NotFoundError("Produto não encontrado");
    if (!prod.forInternalUse) {
      throw new AppError("VALIDATION", "Produto não marcado como uso interno");
    }

    const session = await requireSession();
    const { applyStockDeltaTx } = await import("./stock");
    await db.transaction((tx) =>
      applyStockDeltaTx(tx, {
        tenantId: tenant.id,
        productId: prod.id,
        deltaQty: -qty,
        reason: "internal",
        notes: "Uso interno",
        createdByUserId: session.user.id,
      })
    );

    return { ok: true, id: prod.id };
  } catch (err) {
    if (err instanceof AppError || err instanceof NotFoundError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    return { ok: false, error: "Erro ao baixar estoque" };
  }
}

export async function createService(input: {
  name: string;
  durationMin?: string;
  price: string;
  commissionPct?: string;
  bookableOnline?: boolean;
}): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const name = input.name.trim();
    if (name.length < 2) throw new AppError("VALIDATION", "Nome obrigatório");
    const durationMin = Math.max(5, Math.min(480, Number(input.durationMin) || 30));
    const pct = input.commissionPct?.trim()
      ? Math.round(Number(String(input.commissionPct).replace(",", ".")) * 100)
      : null;
    const db = createDb();
    const [row] = await db
      .insert(schema.services)
      .values({
        tenantId: tenant.id,
        name: name.slice(0, 160),
        durationMin,
        priceCents: moneyToCents(input.price || "0"),
        commissionBps: pct != null && Number.isFinite(pct) ? pct : null,
        bookableOnline: input.bookableOnline !== false,
        isActive: true,
      })
      .returning({ id: schema.services.id });
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    return { ok: false, error: "Erro ao criar serviço" };
  }
}

export async function updateService(
  id: string,
  input: {
    name: string;
    durationMin?: string;
    price: string;
    commissionPct?: string;
    bookableOnline?: boolean;
  }
): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const name = input.name.trim();
    if (name.length < 2) throw new AppError("VALIDATION", "Nome obrigatório");
    const durationMin = Math.max(5, Math.min(480, Number(input.durationMin) || 30));
    const pct = input.commissionPct?.trim()
      ? Math.round(Number(String(input.commissionPct).replace(",", ".")) * 100)
      : null;
    const db = createDb();
    const [row] = await db
      .update(schema.services)
      .set({
        name: name.slice(0, 160),
        durationMin,
        priceCents: moneyToCents(input.price || "0"),
        commissionBps: pct != null && Number.isFinite(pct) ? pct : null,
        bookableOnline: input.bookableOnline !== false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.services.id, id),
          eq(schema.services.tenantId, tenant.id),
          isNull(schema.services.deletedAt)
        )
      )
      .returning({ id: schema.services.id });
    if (!row) throw new NotFoundError("Serviço não encontrado");
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError || err instanceof NotFoundError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    return { ok: false, error: "Erro ao salvar serviço" };
  }
}

export async function createPackage(input: {
  name: string;
  description?: string;
  price: string;
  bookableOnline?: boolean;
  expiresAfterDays?: number | null;
  commissionPct?: string;
  items?: Array<{ serviceId?: string; productId?: string; qty: number }>;
}): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const name = input.name.trim();
    if (name.length < 2) throw new AppError("VALIDATION", "Nome obrigatório");
    const items = (input.items ?? [])
      .filter((i) => i.serviceId || i.productId)
      .map((i) => ({
        ...(i.serviceId ? { serviceId: i.serviceId } : {}),
        ...(i.productId ? { productId: i.productId } : {}),
        qty: Math.max(1, i.qty || 1),
      }));
    if (items.length === 0) {
      throw new AppError("VALIDATION", "Inclua ao menos 1 serviço ou produto no pacote");
    }
    const commissionBps = pctToBps(input.commissionPct);
    const db = createDb();
    const [row] = await db
      .insert(schema.packages)
      .values({
        tenantId: tenant.id,
        name: name.slice(0, 160),
        description: input.description?.trim().slice(0, 500) || null,
        priceCents: moneyToCents(input.price || "0"),
        expiresAfterDays:
          input.expiresAfterDays && input.expiresAfterDays > 0
            ? input.expiresAfterDays
            : null,
        commissionBps,
        bookableOnline: input.bookableOnline !== false,
        isActive: true,
        items,
      })
      .returning({ id: schema.packages.id });
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    return { ok: false, error: "Erro ao criar pacote" };
  }
}

export async function updatePackage(
  id: string,
  input: {
    name: string;
    description?: string;
    price: string;
    bookableOnline?: boolean;
    expiresAfterDays?: number | null;
    commissionPct?: string;
    items?: Array<{ serviceId?: string; productId?: string; qty: number }>;
  }
): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const name = input.name.trim();
    if (name.length < 2) throw new AppError("VALIDATION", "Nome obrigatório");
    const items = (input.items ?? [])
      .filter((i) => i.serviceId || i.productId)
      .map((i) => ({
        ...(i.serviceId ? { serviceId: i.serviceId } : {}),
        ...(i.productId ? { productId: i.productId } : {}),
        qty: Math.max(1, i.qty || 1),
      }));
    if (items.length === 0) {
      throw new AppError("VALIDATION", "Inclua ao menos 1 serviço ou produto no pacote");
    }
    const commissionBps = pctToBps(input.commissionPct);
    const db = createDb();
    const [row] = await db
      .update(schema.packages)
      .set({
        name: name.slice(0, 160),
        description: input.description?.trim().slice(0, 500) || null,
        priceCents: moneyToCents(input.price || "0"),
        expiresAfterDays:
          input.expiresAfterDays && input.expiresAfterDays > 0
            ? input.expiresAfterDays
            : null,
        commissionBps,
        bookableOnline: input.bookableOnline !== false,
        items,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.packages.id, id),
          eq(schema.packages.tenantId, tenant.id),
          isNull(schema.packages.deletedAt)
        )
      )
      .returning({ id: schema.packages.id });
    if (!row) throw new NotFoundError("Pacote não encontrado");
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError || err instanceof NotFoundError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    return { ok: false, error: "Erro ao salvar pacote" };
  }
}

export async function deactivateCatalogItem(
  kind: "product" | "service" | "package",
  id: string
): Promise<ActionResult> {
  try {
    await assertCatalogWrite();
    const tenant = await requireTenantContext();
    const db = createDb();
    const now = new Date();
    if (kind === "product") {
      const [row] = await db
        .update(schema.products)
        .set({ isActive: false, deletedAt: now, updatedAt: now })
        .where(and(eq(schema.products.id, id), eq(schema.products.tenantId, tenant.id)))
        .returning({ id: schema.products.id });
      if (!row) throw new NotFoundError("Produto não encontrado");
      return { ok: true, id: row.id };
    }
    if (kind === "service") {
      const [row] = await db
        .update(schema.services)
        .set({ isActive: false, deletedAt: now, updatedAt: now })
        .where(and(eq(schema.services.id, id), eq(schema.services.tenantId, tenant.id)))
        .returning({ id: schema.services.id });
      if (!row) throw new NotFoundError("Serviço não encontrado");
      return { ok: true, id: row.id };
    }
    const [row] = await db
      .update(schema.packages)
      .set({ isActive: false, deletedAt: now, updatedAt: now })
      .where(and(eq(schema.packages.id, id), eq(schema.packages.tenantId, tenant.id)))
      .returning({ id: schema.packages.id });
    if (!row) throw new NotFoundError("Pacote não encontrado");
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof AppError || err instanceof NotFoundError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    return { ok: false, error: "Erro ao inativar" };
  }
}
