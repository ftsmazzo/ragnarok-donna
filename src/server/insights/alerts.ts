import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { rangeBoundsSp, todaySp, weekBoundsSp } from "@/lib/datetime";
import { requireTenantContext } from "../context/tenant";
import {
  DEFAULT_INACTIVE_DAYS,
  DEFAULT_RECURRENCE_LAPSE_DAYS,
  type OperationalAlert,
  type OperationalAlertsReport,
} from "./types";

const CANCEL_COUNT_THRESHOLD = 5;
const CANCEL_RATE_THRESHOLD_PCT = 15;

export function isBarCategory(category: string | null | undefined): boolean {
  const c = (category ?? "").toLowerCase();
  return /\bbar\b|bebida|drink|cerveja|whisky|refrigerante|porção|petisco|destilado/.test(c);
}

export async function buildOperationalAlerts(): Promise<OperationalAlertsReport> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const today = todaySp();
  const week = weekBoundsSp(today);
  const weekTo = today < week.to ? today : week.to;
  const { start: weekStart, end: weekEnd } = rangeBoundsSp(week.from, weekTo);
  const alerts: OperationalAlert[] = [];

  const lowProducts = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      category: schema.products.category,
      stockQty: schema.products.stockQty,
      minQty: schema.products.minQty,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.tenantId, tenant.id),
        eq(schema.products.isActive, true),
        isNull(schema.products.deletedAt),
        sql`${schema.products.stockQty} <= ${schema.products.minQty}`
      )
    )
    .orderBy(asc(schema.products.stockQty))
    .limit(40);

  const lowShop = lowProducts.filter((p) => !isBarCategory(p.category));
  const lowBar = lowProducts.filter((p) => isBarCategory(p.category));

  if (lowShop.length) {
    alerts.push({
      id: "stock-shop",
      severity: "critical",
      kind: "stock_low_shop",
      title: `${lowShop.length} produto(s) da barbearia abaixo do mínimo`,
      detail: lowShop
        .slice(0, 4)
        .map((p) => `${p.name} (${p.stockQty}/${p.minQty})`)
        .join(" · "),
      count: lowShop.length,
      href: "/relatorios/estoque?scope=shop&low=1",
      periodLabel: "agora",
    });
  }
  if (lowBar.length) {
    alerts.push({
      id: "stock-bar",
      severity: "critical",
      kind: "stock_low_bar",
      title: `${lowBar.length} item(ns) do bar abaixo do mínimo`,
      detail: lowBar
        .slice(0, 4)
        .map((p) => `${p.name} (${p.stockQty}/${p.minQty})`)
        .join(" · "),
      count: lowBar.length,
      href: "/relatorios/estoque?scope=bar&low=1",
      periodLabel: "agora",
    });
  }

  const [apptAgg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      cancelled: sql<number>`count(*) filter (where ${schema.appointments.status} = 'cancelled')::int`,
      noShow: sql<number>`count(*) filter (where ${schema.appointments.status} = 'no_show')::int`,
    })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, tenant.id),
        isNull(schema.appointments.deletedAt),
        gte(schema.appointments.startsAt, weekStart),
        lte(schema.appointments.startsAt, weekEnd),
        sql`${schema.appointments.status} <> 'blocked'`
      )
    );

  const totalAppt = Number(apptAgg?.total ?? 0);
  const cancelled = Number(apptAgg?.cancelled ?? 0);
  const noShow = Number(apptAgg?.noShow ?? 0);
  const cancelLike = cancelled + noShow;
  const cancelRate = totalAppt > 0 ? Math.round((cancelLike / totalAppt) * 1000) / 10 : 0;
  const manyCancels =
    cancelLike >= CANCEL_COUNT_THRESHOLD ||
    (totalAppt >= 8 && cancelRate >= CANCEL_RATE_THRESHOLD_PCT);

  if (manyCancels && cancelLike > 0) {
    alerts.push({
      id: "cancels-week",
      severity: cancelRate >= 25 || cancelLike >= 10 ? "critical" : "warning",
      kind: "cancellations_week",
      title: `${cancelLike} cancelamento(s)/no-show nesta semana`,
      detail: `${cancelled} cancelados · ${noShow} no-show · ${cancelRate}% do volume (${totalAppt} agendamentos)`,
      count: cancelLike,
      href: `/relatorios/agendamentos?period=week&from=${week.from}&to=${weekTo}`,
      periodLabel: "esta semana",
    });
  }

  const returned = await db.execute(sql`
    with week_activity as (
      select distinct client_id, min(at) as first_at
      from (
        select a.client_id, a.starts_at as at
        from appointments a
        where a.tenant_id = ${tenant.id}
          and a.deleted_at is null
          and a.client_id is not null
          and a.status not in ('cancelled', 'no_show', 'blocked')
          and a.starts_at >= ${weekStart}
          and a.starts_at <= ${weekEnd}
        union all
        select o.client_id, coalesce(o.closed_at, o.opened_at) as at
        from orders o
        where o.tenant_id = ${tenant.id}
          and o.deleted_at is null
          and o.client_id is not null
          and o.status = 'closed'
          and coalesce(o.closed_at, o.opened_at) >= ${weekStart}
          and coalesce(o.closed_at, o.opened_at) <= ${weekEnd}
      ) u
      group by client_id
    ),
    prior as (
      select wa.client_id, wa.first_at,
        (
          select max(x.at) from (
            select a.starts_at as at from appointments a
            where a.tenant_id = ${tenant.id} and a.client_id = wa.client_id
              and a.deleted_at is null and a.status not in ('cancelled','no_show','blocked')
              and a.starts_at < wa.first_at
            union all
            select coalesce(o.closed_at, o.opened_at) as at from orders o
            where o.tenant_id = ${tenant.id} and o.client_id = wa.client_id
              and o.deleted_at is null and o.status = 'closed'
              and coalesce(o.closed_at, o.opened_at) < wa.first_at
          ) x
        ) as prev_at
      from week_activity wa
    )
    select p.client_id, c.name as client_name, c.phone,
      extract(day from (p.first_at - p.prev_at))::int as gap_days
    from prior p
    join clients c on c.id = p.client_id
    where p.prev_at is not null
      and p.prev_at <= p.first_at - (${DEFAULT_RECURRENCE_LAPSE_DAYS} * interval '1 day')
    order by gap_days desc
    limit 60
  `);

  const widerRows = [...returned] as unknown as {
    client_id: string;
    client_name: string;
    phone: string | null;
    gap_days: number;
  }[];

  const renewals = widerRows.filter(
    (r) => r.gap_days >= DEFAULT_RECURRENCE_LAPSE_DAYS && r.gap_days < DEFAULT_INACTIVE_DAYS
  );
  const lostBack = widerRows.filter((r) => r.gap_days >= DEFAULT_INACTIVE_DAYS);

  if (renewals.length) {
    alerts.push({
      id: "renewals-week",
      severity: "info",
      kind: "renewals_week",
      title: `${renewals.length} renovação(ões) nesta semana`,
      detail: renewals
        .slice(0, 4)
        .map((r) => `${r.client_name} (após ${r.gap_days}d)`)
        .join(" · "),
      count: renewals.length,
      href: "/relatorios/perfil?tab=recorrencia",
      periodLabel: "esta semana",
    });
  }

  if (lostBack.length) {
    alerts.push({
      id: "returned-week",
      severity: "info",
      kind: "returned_lost_week",
      title: `${lostBack.length} cliente(s) perdido(s) voltaram esta semana`,
      detail: lostBack
        .slice(0, 4)
        .map((r) => `${r.client_name} (sumiu ${r.gap_days}d)`)
        .join(" · "),
      count: lostBack.length,
      href: "/relatorios/perfil?tab=retorno",
      periodLabel: "esta semana",
    });
  }

  const [openOld] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt),
        sql`${schema.orders.openedAt} < now() - interval '1 day'`
      )
    );
  const openOldN = Number(openOld?.n ?? 0);
  if (openOldN > 0) {
    alerts.push({
      id: "open-orders",
      severity: "warning",
      kind: "open_orders_stale",
      title: `${openOldN} comanda(s) aberta(s) há mais de 1 dia`,
      detail: "Feche no Caixa para a receita aparecer nos relatórios.",
      count: openOldN,
      href: "/comandas",
      periodLabel: "agora",
    });
  }

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    generatedAt: new Date().toISOString(),
    weekFrom: week.from,
    weekTo: weekTo,
    summary: {
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
      total: alerts.length,
      lowStockShop: lowShop.length,
      lowStockBar: lowBar.length,
      cancellationsWeek: cancelLike,
      cancelRatePct: cancelRate,
      appointmentsWeek: totalAppt,
      renewalsWeek: renewals.length,
      returnedLostWeek: lostBack.length,
    },
    alerts,
    returnedClients: lostBack.slice(0, 20).map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name,
      phone: r.phone,
      gapDays: r.gap_days,
    })),
    renewalClients: renewals.slice(0, 20).map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name,
      phone: r.phone,
      gapDays: r.gap_days,
    })),
  };
}
