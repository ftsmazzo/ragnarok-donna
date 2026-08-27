import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "../context/tenant";
import {
  DEFAULT_ACTIONABLE_WINDOW_DAYS,
  DEFAULT_INACTIVE_DAYS,
  DEFAULT_INACTIVE_WINDOW_DAYS,
  DEFAULT_PRODUCT_REBUY_DAYS,
  DEFAULT_RECURRENCE_LAPSE_DAYS,
  DEFAULT_SERVICE_RETURN_DAYS,
  type ClientUpsellTip,
  type FollowUpRow,
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
  if (kind === "recurrence_lapsed") return `Recorrência parada: ${name}`;
  if (kind === "inactive_return") return `Convidar a voltar`;
  return `Costuma fazer: ${name}`;
}

/** Categoria AppBarber "Recorrência" (e variações). */
const RECURRENCE_CAT = sql`(${schema.serviceCategories.name} ilike '%recorr%')`;

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
      categoryName: schema.serviceCategories.name,
      lastAt: sql<Date>`max(${schema.orderItems.performedAt})`.as("last_at"),
      cnt: sql<number>`count(*)::int`.as("cnt"),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
    .leftJoin(
      schema.serviceCategories,
      eq(schema.services.categoryId, schema.serviceCategories.id)
    )
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
      schema.services.returnAfterDays,
      schema.serviceCategories.name
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
    const isRecurrence = (row.categoryName ?? "").toLowerCase().includes("recorr");
    const daysSince = daysBetween(new Date(row.lastAt));

    if (isRecurrence) {
      if (
        daysSince >= DEFAULT_RECURRENCE_LAPSE_DAYS &&
        daysSince <= DEFAULT_ACTIONABLE_WINDOW_DAYS
      ) {
        tips.push({
          kind: "recurrence_lapsed",
          title: tipTitle("recurrence_lapsed", row.name),
          detail: `Sem renovação há ${daysSince} dias (alerta ${DEFAULT_RECURRENCE_LAPSE_DAYS}d)`,
          daysSince,
          catalogId: row.serviceId,
          catalogName: row.name,
        });
      }
      continue;
    }

    const threshold = row.returnAfterDays ?? DEFAULT_SERVICE_RETURN_DAYS;
    if (daysSince >= threshold && daysSince <= DEFAULT_ACTIONABLE_WINDOW_DAYS) {
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
    if (
      daysSince >= DEFAULT_PRODUCT_REBUY_DAYS &&
      daysSince <= DEFAULT_ACTIONABLE_WINDOW_DAYS
    ) {
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

  const favorite = [...serviceRows]
    .filter((r) => !(r.categoryName ?? "").toLowerCase().includes("recorr"))
    .sort((a, b) => Number(b.cnt) - Number(a.cnt))[0];
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

/** Serviços avulsos/outros além do ciclo — exclui categoria Recorrência. Janela máx. 100d. */
async function loadServiceDueRows(
  tenantId: string,
  thresholdFallback: number,
  windowDays = DEFAULT_ACTIONABLE_WINDOW_DAYS,
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
    .leftJoin(
      schema.serviceCategories,
      eq(schema.services.categoryId, schema.serviceCategories.id)
    )
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
        eq(schema.clients.isActive, true),
        or(isNull(schema.serviceCategories.id), sql`not ${RECURRENCE_CAT}`)
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
      sql`max(${schema.orderItems.performedAt}) <= now() - (coalesce(${schema.services.returnAfterDays}, ${thresholdFallback}) * interval '1 day')
        and max(${schema.orderItems.performedAt}) >= now() - (${windowDays} * interval '1 day')`
    )
    .orderBy(desc(sql`max(${schema.orderItems.performedAt})`))
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
  windowDays = DEFAULT_ACTIONABLE_WINDOW_DAYS,
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
      sql`max(${schema.orderItems.performedAt}) <= now() - (${thresholdDays} * interval '1 day')
        and max(${schema.orderItems.performedAt}) >= now() - (${windowDays} * interval '1 day')`
    )
    .orderBy(desc(sql`max(${schema.orderItems.performedAt})`))
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

/** Teve serviço da categoria Recorrência e não renovou — só dentro da janela saudável. */
async function loadRecurrenceLapsed(
  tenantId: string,
  lapseDays: number,
  windowDays = DEFAULT_ACTIONABLE_WINDOW_DAYS,
  limit = 100
): Promise<FollowUpRow[]> {
  const db = createDb();
  const maxDays = Math.max(lapseDays, windowDays);
  const rows = await db
    .select({
      clientId: schema.orders.clientId,
      clientName: schema.clients.name,
      phone: schema.clients.phone,
      lastServiceName: sql<string>`(array_agg(${schema.services.name} order by ${schema.orderItems.performedAt} desc))[1]`.as(
        "last_service"
      ),
      lastAt: sql<Date>`max(${schema.orderItems.performedAt})`.as("last_at"),
      visits: sql<number>`count(*)::int`.as("visits"),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
    .innerJoin(schema.services, eq(schema.orderItems.serviceId, schema.services.id))
    .innerJoin(
      schema.serviceCategories,
      eq(schema.services.categoryId, schema.serviceCategories.id)
    )
    .where(
      and(
        eq(schema.orderItems.tenantId, tenantId),
        eq(schema.orders.tenantId, tenantId),
        eq(schema.orderItems.itemType, "service"),
        isNotNull(schema.orders.clientId),
        isNotNull(schema.orderItems.performedAt),
        isNull(schema.orders.deletedAt),
        isNull(schema.clients.deletedAt),
        eq(schema.clients.isActive, true),
        RECURRENCE_CAT
      )
    )
    .groupBy(schema.orders.clientId, schema.clients.name, schema.clients.phone)
    .having(
      sql`max(${schema.orderItems.performedAt}) <= now() - (${lapseDays} * interval '1 day')
        and max(${schema.orderItems.performedAt}) >= now() - (${maxDays} * interval '1 day')`
    )
    .orderBy(desc(sql`max(${schema.orderItems.performedAt})`))
    .limit(limit);

  return rows
    .filter((r) => r.clientId && r.lastAt)
    .map((r) => {
      const lastAt = new Date(r.lastAt!);
      return {
        clientId: r.clientId!,
        clientName: r.clientName ?? "Cliente",
        phone: r.phone,
        lastAt,
        daysSince: daysBetween(lastAt),
        thresholdDays: lapseDays,
        lastServiceName: r.lastServiceName ?? null,
        reason: "recurrence_lapsed" as const,
      };
    });
}

/**
 * Lista nominal saudável de retorno:
 * - sem serviço (item_type=service) e sem aparição na agenda nos últimos `minDays`
 * - última visita ainda dentro da janela `windowDays` (não puxa quem sumiu há anos)
 * Ordenada por dias sem vir (maior primeiro).
 */
async function loadInactiveClients(
  tenantId: string,
  minDays: number,
  windowDays: number,
  limit = 250
): Promise<FollowUpRow[]> {
  const db = createDb();
  const maxDays = Math.max(minDays, windowDays);

  const result = await db.execute(sql`
    with services as (
      select
        o.client_id,
        max(oi.performed_at) as last_service_at,
        (
          array_agg(oi.description order by oi.performed_at desc nulls last)
          filter (where oi.performed_at is not null)
        )[1] as last_service
      from order_items oi
      inner join orders o on o.id = oi.order_id
      where oi.tenant_id = ${tenantId}
        and o.tenant_id = ${tenantId}
        and o.client_id is not null
        and o.deleted_at is null
        and oi.item_type = 'service'
        and oi.performed_at is not null
      group by o.client_id
    ),
    appts as (
      select
        a.client_id,
        max(a.starts_at) as last_appt_at
      from appointments a
      where a.tenant_id = ${tenantId}
        and a.client_id is not null
        and a.deleted_at is null
        and a.status not in ('blocked', 'cancelled')
      group by a.client_id
    ),
    merged as (
      select
        c.id as client_id,
        c.name as client_name,
        c.phone,
        greatest(services.last_service_at, appts.last_appt_at) as last_at,
        services.last_service
      from clients c
      inner join services on services.client_id = c.id
      left join appts on appts.client_id = c.id
      where c.tenant_id = ${tenantId}
        and c.deleted_at is null
        and c.is_active = true
        and greatest(services.last_service_at, appts.last_appt_at) is not null
    )
    select client_id, client_name, phone, last_at, last_service
    from merged
    where last_at <= now() - (${minDays} * interval '1 day')
      and last_at >= now() - (${maxDays} * interval '1 day')
    order by last_at asc
    limit ${limit}
  `);

  const list = [...result] as unknown as {
    client_id: string;
    client_name: string;
    phone: string | null;
    last_at: Date;
    last_service: string | null;
  }[];

  return list.map((r) => {
    const lastAt = new Date(r.last_at);
    return {
      clientId: r.client_id,
      clientName: r.client_name ?? "Cliente",
      phone: r.phone,
      lastAt,
      daysSince: daysBetween(lastAt),
      thresholdDays: minDays,
      lastServiceName: r.last_service,
      reason: "inactive" as const,
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
  recurrenceDays?: number;
  inactiveDays?: number;
  inactiveWindowDays?: number;
}): Promise<PerfilReport> {
  const tenant = await requireTenantContext();
  const serviceThresholdDays = opts?.serviceDays ?? DEFAULT_SERVICE_RETURN_DAYS;
  const productThresholdDays = opts?.productDays ?? DEFAULT_PRODUCT_REBUY_DAYS;
  const recurrenceLapseDays = opts?.recurrenceDays ?? DEFAULT_RECURRENCE_LAPSE_DAYS;
  const inactiveDays = opts?.inactiveDays ?? DEFAULT_INACTIVE_DAYS;
  const inactiveWindowDays = opts?.inactiveWindowDays ?? DEFAULT_INACTIVE_WINDOW_DAYS;

  const [serviceDue, productDue, recurrenceLapsed, inactiveClients, lowStockCount] =
    await Promise.all([
      loadServiceDueRows(tenant.id, serviceThresholdDays),
      loadProductDueRows(tenant.id, productThresholdDays),
      loadRecurrenceLapsed(tenant.id, recurrenceLapseDays),
      loadInactiveClients(tenant.id, inactiveDays, inactiveWindowDays),
      countLowStock(tenant.id),
    ]);

  return {
    serviceThresholdDays,
    productThresholdDays,
    recurrenceLapseDays,
    inactiveDays,
    inactiveWindowDays,
    serviceDue,
    productDue,
    recurrenceLapsed,
    inactiveClients,
    lowStockCount,
    serviceDueCount: serviceDue.length,
    productDueCount: productDue.length,
    recurrenceLapsedCount: recurrenceLapsed.length,
    inactiveCount: inactiveClients.length,
  };
}

export async function getWeeklyInsights(): Promise<WeeklyInsights> {
  const report = await reportPerfil();
  const uniqueServiceClients = new Set(report.serviceDue.map((r) => r.clientId)).size;
  const uniqueProductClients = new Set(report.productDue.map((r) => r.clientId)).size;

  const cards = [
    {
      id: "inactive",
      label: "Lista de retorno",
      value: report.inactiveCount,
      hint: `${report.inactiveDays}–${report.inactiveWindowDays}d sem vir`,
      href: "/relatorios/perfil?tab=retorno",
    },
    {
      id: "recurrence",
      label: "Recorrência parada",
      value: report.recurrenceLapsedCount,
      hint: `${report.recurrenceLapseDays}d+ sem renovar`,
      href: "/relatorios/perfil?tab=recorrencia",
    },
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
  ];

  const tips: string[] = [];
  if (report.inactiveCount > 0) {
    const sample = [...report.inactiveClients].sort((a, b) => a.daysSince - b.daysSince)[0];
    tips.push(
      `Retorno: ${report.inactiveCount} cliente(s) entre ${report.inactiveDays} e ${report.inactiveWindowDays} dias sem vir — ex.: ${sample.clientName} (${sample.daysSince}d).`
    );
  }
  if (report.recurrenceLapsedCount > 0) {
    const sample = [...report.recurrenceLapsed].sort((a, b) => a.daysSince - b.daysSince)[0];
    tips.push(
      `Recorrência: ${sample.clientName} sem renovação há ${sample.daysSince} dias${sample.lastServiceName ? ` (${sample.lastServiceName})` : ""}.`
    );
  }
  if (report.serviceDueCount > 0) {
    const sample = [...report.serviceDue].sort((a, b) => a.daysSince - b.daysSince)[0];
    tips.push(
      `Reoferecer: ${sample.clientName} fez ${sample.catalogName} há ${sample.daysSince} dias.`
    );
  }
  if (tips.length === 0) {
    tips.push("Sem alertas críticos esta semana — mantenha a cadência de agenda e comandas.");
  }

  return { cards, tips };
}
