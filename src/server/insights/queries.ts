import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "../context/tenant";
import {
  DEFAULT_PRODUCT_REBUY_DAYS,
  DEFAULT_SERVICE_RETURN_DAYS,
  type ClientUpsellTip,
  type PerfilReofferRow,
  type PerfilReport,
  type WeeklyInsights,
} from "./types";

function daysBetween(from: Date, to = new Date()): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function tipTitle(kind: ClientUpsellTip["kind"], name: string): string {
  if (kind === "service_due") return `Reoferecer: ${name}`;
  if (kind === "product_due") return `Produto: ${name}`;
  return `Costuma fazer: ${name}`;
}

/** Dicas leve para o modal da agenda (1–3 bullets). */
export async function getClientUpsellTips(clientId: string): Promise<ClientUpsellTip[]> {
  const tenant = await requireTenantContext();
  const db = createDb();

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
  if (!client) return [];

  const serviceRows = await db
    .select({
      serviceId: schema.orderItems.serviceId,
      name: schema.services.name,
      returnAfterDays: schema.services.returnAfterDays,
      lastAt: sql<Date>`max(${schema.orderItems.performedAt})`.as("last_at"),
      cnt: sql<number>`count(*)::int`.as("cnt"),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenant.id),
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.clientId, clientId),
        eq(schema.orderItems.itemType, "service"),
        isNotNull(schema.orderItems.serviceId),
        isNotNull(schema.orderItems.performedAt),
        isNull(schema.orders.deletedAt)
      )
    )
    .groupBy(
      schema.orderItems.serviceId,
      schema.services.name,
      schema.services.returnAfterDays
    )
    .orderBy(desc(sql`max(${schema.orderItems.performedAt})`));

  const productRows = await db
    .select({
      productId: schema.orderItems.productId,
      name: schema.products.name,
      lastAt: sql<Date>`max(${schema.orderItems.performedAt})`.as("last_at"),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenant.id),
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.clientId, clientId),
        eq(schema.orderItems.itemType, "product"),
        isNotNull(schema.orderItems.productId),
        isNotNull(schema.orderItems.performedAt),
        isNull(schema.orders.deletedAt)
      )
    )
    .groupBy(schema.orderItems.productId, schema.products.name)
    .orderBy(desc(sql`max(${schema.orderItems.performedAt})`));

  const tips: ClientUpsellTip[] = [];

  for (const row of serviceRows) {
    if (!row.serviceId || !row.lastAt) continue;
    const threshold = row.returnAfterDays ?? DEFAULT_SERVICE_RETURN_DAYS;
    const daysSince = daysBetween(new Date(row.lastAt));
    if (daysSince >= threshold) {
      tips.push({
        kind: "service_due",
        title: tipTitle("service_due", row.name),
        detail: `Última vez há ${daysSince} dias (ciclo ${threshold} dias)`,
        daysSince,
        catalogId: row.serviceId,
        catalogName: row.name,
      });
    }
    if (tips.filter((t) => t.kind === "service_due").length >= 2) break;
  }

  for (const row of productRows) {
    if (!row.productId || !row.lastAt) continue;
    const daysSince = daysBetween(new Date(row.lastAt));
    if (daysSince >= DEFAULT_PRODUCT_REBUY_DAYS) {
      tips.push({
        kind: "product_due",
        title: tipTitle("product_due", row.name),
        detail: `Comprou há ${daysSince} dias — bom momento para oferecer de novo`,
        daysSince,
        catalogId: row.productId,
        catalogName: row.name,
      });
      break;
    }
  }

  const favorite = [...serviceRows].sort((a, b) => Number(b.cnt) - Number(a.cnt))[0];
  if (favorite?.serviceId && favorite.name) {
    const already = tips.some((t) => t.catalogId === favorite.serviceId);
    if (!already) {
      tips.push({
        kind: "favorite_service",
        title: tipTitle("favorite_service", favorite.name),
        detail: `${Number(favorite.cnt)}x no histórico — âncora de conversa`,
        daysSince: favorite.lastAt ? daysBetween(new Date(favorite.lastAt)) : null,
        catalogId: favorite.serviceId,
        catalogName: favorite.name,
      });
    }
  }

  return tips.slice(0, 3);
}

async function loadServiceDueRows(
  tenantId: string,
  thresholdFallback: number,
  limit = 80
): Promise<PerfilReofferRow[]> {
  const db = createDb();
  const rows = await db
    .select({
      clientId: schema.orders.clientId,
      clientName: schema.clients.name,
      phone: schema.clients.phone,
      catalogId: schema.orderItems.serviceId,
      catalogName: schema.services.name,
      returnAfterDays: schema.services.returnAfterDays,
      lastAt: sql<Date>`max(${schema.orderItems.performedAt})`.as("last_at"),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .innerJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orders.tenantId, tenantId),
        eq(schema.orderItems.itemType, "service"),
        isNotNull(schema.orderItems.serviceId),
        isNotNull(schema.orders.clientId),
        isNotNull(schema.orderItems.performedAt),
        isNull(schema.orders.deletedAt),
        isNull(schema.clients.deletedAt),
        eq(schema.clients.isActive, true)
      )
    )
    .groupBy(
      schema.orders.clientId,
      schema.clients.name,
      schema.clients.phone,
      schema.orderItems.serviceId,
      schema.services.name,
      schema.services.returnAfterDays
    )
    .having(
      sql`max(${schema.orderItems.performedAt}) <= now() - (coalesce(${schema.services.returnAfterDays}, ${thresholdFallback}) * interval '1 day')`
    )
    .orderBy(asc(sql`max(${schema.orderItems.performedAt})`))
    .limit(limit);

  return rows
    .filter((r) => r.clientId && r.catalogId && r.lastAt)
    .map((r) => {
      const threshold = r.returnAfterDays ?? thresholdFallback;
      const lastAt = new Date(r.lastAt!);
      return {
        clientId: r.clientId!,
        clientName: r.clientName ?? "Cliente",
        phone: r.phone,
        catalogId: r.catalogId!,
        catalogName: r.catalogName,
        lastAt,
        daysSince: daysBetween(lastAt),
        thresholdDays: threshold,
      };
    });
}

async function loadProductDueRows(
  tenantId: string,
  thresholdDays: number,
  limit = 80
): Promise<PerfilReofferRow[]> {
  const db = createDb();
  const rows = await db
    .select({
      clientId: schema.orders.clientId,
      clientName: schema.clients.name,
      phone: schema.clients.phone,
      catalogId: schema.orderItems.productId,
      catalogName: schema.products.name,
      lastAt: sql<Date>`max(${schema.orderItems.performedAt})`.as("last_at"),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orders.tenantId, tenantId),
        eq(schema.orderItems.itemType, "product"),
        isNotNull(schema.orderItems.productId),
        isNotNull(schema.orders.clientId),
        isNotNull(schema.orderItems.performedAt),
        isNull(schema.orders.deletedAt),
        isNull(schema.clients.deletedAt),
        eq(schema.clients.isActive, true)
      )
    )
    .groupBy(
      schema.orders.clientId,
      schema.clients.name,
      schema.clients.phone,
      schema.orderItems.productId,
      schema.products.name
    )
    .having(
      sql`max(${schema.orderItems.performedAt}) <= now() - (${thresholdDays} * interval '1 day')`
    )
    .orderBy(asc(sql`max(${schema.orderItems.performedAt})`))
    .limit(limit);

  return rows
    .filter((r) => r.clientId && r.catalogId && r.lastAt)
    .map((r) => {
      const lastAt = new Date(r.lastAt!);
      return {
        clientId: r.clientId!,
        clientName: r.clientName ?? "Cliente",
        phone: r.phone,
        catalogId: r.catalogId!,
        catalogName: r.catalogName,
        lastAt,
        daysSince: daysBetween(lastAt),
        thresholdDays,
      };
    });
}

async function countLowStock(tenantId: string): Promise<number> {
  const db = createDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.tenantId, tenantId),
        eq(schema.products.isActive, true),
        isNull(schema.products.deletedAt),
        sql`${schema.products.stockQty} <= ${schema.products.minQty}`
      )
    );
  return Number(row?.n ?? 0);
}

export async function reportPerfil(opts?: {
  serviceDays?: number;
  productDays?: number;
}): Promise<PerfilReport> {
  const tenant = await requireTenantContext();
  const serviceThresholdDays = opts?.serviceDays ?? DEFAULT_SERVICE_RETURN_DAYS;
  const productThresholdDays = opts?.productDays ?? DEFAULT_PRODUCT_REBUY_DAYS;

  const [serviceDue, productDue, lowStockCount] = await Promise.all([
    loadServiceDueRows(tenant.id, serviceThresholdDays),
    loadProductDueRows(tenant.id, productThresholdDays),
    countLowStock(tenant.id),
  ]);

  return {
    serviceThresholdDays,
    productThresholdDays,
    serviceDue,
    productDue,
    lowStockCount,
    serviceDueCount: serviceDue.length,
    productDueCount: productDue.length,
  };
}

export async function getWeeklyInsights(): Promise<WeeklyInsights> {
  const report = await reportPerfil();
  const uniqueServiceClients = new Set(report.serviceDue.map((r) => r.clientId)).size;
  const uniqueProductClients = new Set(report.productDue.map((r) => r.clientId)).size;

  const cards = [
    {
      id: "service_due",
      label: "Serviços a reoferecer",
      value: report.serviceDueCount,
      hint: `${uniqueServiceClients} cliente(s) · ciclo ${report.serviceThresholdDays}d`,
      href: "/relatorios/perfil?tab=servicos",
    },
    {
      id: "product_due",
      label: "Produtos a reoferecer",
      value: report.productDueCount,
      hint: `${uniqueProductClients} cliente(s) · ${report.productThresholdDays}d+`,
      href: "/relatorios/perfil?tab=produtos",
    },
    {
      id: "low_stock",
      label: "Estoque baixo",
      value: report.lowStockCount,
      hint: "stock ≤ mínimo",
      href: "/relatorios/estoque",
    },
  ];

  const tips: string[] = [];
  if (report.serviceDueCount > 0) {
    const sample = report.serviceDue[0];
    tips.push(
      `Priorize recontato: ${sample.clientName} fez ${sample.catalogName} há ${sample.daysSince} dias.`
    );
  }
  if (report.productDueCount > 0) {
    tips.push(
      `${uniqueProductClients} cliente(s) podem recomprar produto nesta semana — use a agenda para oferecer.`
    );
  }
  if (report.lowStockCount > 0) {
    tips.push(`${report.lowStockCount} produto(s) no mínimo de estoque — planeje reposição.`);
  }
  if (tips.length === 0) {
    tips.push("Sem alertas críticos esta semana — mantenha a cadência de agenda e comandas.");
  }

  return { cards, tips };
}
