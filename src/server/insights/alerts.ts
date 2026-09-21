import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { monthStartSp, rangeBoundsSp, todaySp, weekBoundsSp } from "@/lib/datetime";
import { formatMoney } from "@/lib/format";
import { isBarCategory, isInsumoCategory } from "@/lib/product-category";
import { requireTenantContext } from "../context/tenant";
import { listCrmFrequency } from "../crm/frequency";
import { sumClosedExtraServicesByStaff } from "./extras-ranking";
import {
  DEFAULT_INACTIVE_DAYS,
  DEFAULT_RECURRENCE_LAPSE_DAYS,
  type OperationalAlert,
  type OperationalAlertsReport,
} from "./types";

const CANCEL_COUNT_THRESHOLD = 5;
const CANCEL_RATE_THRESHOLD_PCT = 15;

export { isBarCategory };

export async function buildOperationalAlerts(): Promise<OperationalAlertsReport> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const today = todaySp();
  const week = weekBoundsSp(today);
  const weekTo = today < week.to ? today : week.to;
  const { start: weekStart, end: weekEnd } = rangeBoundsSp(week.from, weekTo);
  // postgres.js + drizzle: Date quebra serialização — sempre ISO string.
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();
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

  const lowShop = lowProducts.filter(
    (p) => !isBarCategory(p.category) && !isInsumoCategory(p.category)
  );
  const lowBar = lowProducts.filter((p) => isBarCategory(p.category));
  const lowInsumos = lowProducts.filter(
    (p) => isInsumoCategory(p.category) && !isBarCategory(p.category)
  );

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
  if (lowInsumos.length) {
    alerts.push({
      id: "stock-insumos",
      severity: "warning",
      kind: "stock_low_insumos",
      title: `${lowInsumos.length} insumo(s) abaixo do mínimo`,
      detail: lowInsumos
        .slice(0, 4)
        .map((p) => `${p.name} (${p.stockQty}/${p.minQty})`)
        .join(" · "),
      count: lowInsumos.length,
      href: "/relatorios/estoque?scope=insumos&low=1",
      periodLabel: "agora",
    });
  }

  // Orçamento de compras (mês civil atual)
  const [tenantSettingsRow] = await db
    .select({ settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenant.id))
    .limit(1);
  const settings =
    tenantSettingsRow?.settings && typeof tenantSettingsRow.settings === "object"
      ? (tenantSettingsRow.settings as Record<string, unknown>)
      : {};
  const budgetRaw = settings.purchaseBudgetCents;
  const purchaseBudgetCents =
    typeof budgetRaw === "number" && Number.isFinite(budgetRaw) && budgetRaw > 0
      ? Math.floor(budgetRaw)
      : null;

  if (purchaseBudgetCents != null) {
    const monthFrom = monthStartSp();
    const { start: monthStart, end: monthEnd } = rangeBoundsSp(monthFrom, today);
    const [purchaseAgg] = await db
      .select({
        cents: sql<number>`coalesce(sum(
          abs(${schema.stockMovements.deltaQty}) * coalesce(${schema.products.costCents}, ${schema.products.priceCents}, 0)
        ), 0)::int`,
      })
      .from(schema.stockMovements)
      .innerJoin(schema.products, eq(schema.stockMovements.productId, schema.products.id))
      .where(
        and(
          eq(schema.stockMovements.tenantId, tenant.id),
          eq(schema.stockMovements.reason, "purchase"),
          sql`${schema.stockMovements.deltaQty} > 0`,
          sql`${schema.stockMovements.createdAt} >= ${monthStart.toISOString()}::timestamptz`,
          sql`${schema.stockMovements.createdAt} <= ${monthEnd.toISOString()}::timestamptz`
        )
      );

    const spent = Number(purchaseAgg?.cents ?? 0);
    const pct = purchaseBudgetCents > 0 ? Math.round((spent / purchaseBudgetCents) * 100) : 0;
    if (spent >= purchaseBudgetCents) {
      alerts.push({
        id: "purchase-budget",
        severity: "critical",
        kind: "purchase_budget",
        title: `Orçamento de compras estourado (${pct}%)`,
        detail: `${formatMoney(spent)} de ${formatMoney(purchaseBudgetCents)} no mês`,
        count: 1,
        href: "/relatorios/estoque?low=1",
        periodLabel: "mês",
      });
    } else if (pct >= 80) {
      alerts.push({
        id: "purchase-budget",
        severity: "warning",
        kind: "purchase_budget",
        title: `Orçamento de compras em ${pct}%`,
        detail: `${formatMoney(spent)} de ${formatMoney(purchaseBudgetCents)} no mês`,
        count: 1,
        href: "/configuracoes/empresa",
        periodLabel: "mês",
      });
    }
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
        sql`${schema.appointments.startsAt} >= ${weekStartIso}::timestamptz`,
        sql`${schema.appointments.startsAt} <= ${weekEndIso}::timestamptz`,
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
      select client_id, min(at) as first_at
      from (
        select a.client_id, a.starts_at as at
        from appointments a
        where a.tenant_id = ${tenant.id}
          and a.deleted_at is null
          and a.client_id is not null
          and a.status not in ('cancelled', 'no_show', 'blocked')
          and a.starts_at >= ${weekStartIso}::timestamptz
          and a.starts_at <= ${weekEndIso}::timestamptz
        union all
        select o.client_id, coalesce(o.closed_at, o.opened_at) as at
        from orders o
        where o.tenant_id = ${tenant.id}
          and o.deleted_at is null
          and o.client_id is not null
          and o.status = 'closed'
          and coalesce(o.closed_at, o.opened_at) >= ${weekStartIso}::timestamptz
          and coalesce(o.closed_at, o.opened_at) <= ${weekEndIso}::timestamptz
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

  try {
    const due = await listCrmFrequency({ filter: "due", limit: 40 });
    const dueN = due.counts.due ?? due.rows.length;
    if (dueN > 0) {
      alerts.push({
        id: "crm-due-return",
        severity: "warning",
        kind: "crm_due_return",
        title: `${dueN} cliente(s) na hora de voltar`,
        detail: due.rows
          .slice(0, 4)
          .map((r) => `${r.name} (${r.daysSince ?? "?"}d · ${r.label})`)
          .join(" · "),
        count: dueN,
        href: "/crm?view=retorno",
        periodLabel: "agora",
      });
    }
  } catch (err) {
    console.error("[alerts] crm due return", err);
  }

  const [openOld] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.tenantId, tenant.id),
        eq(schema.orders.status, "open"),
        isNull(schema.orders.deletedAt),
        sql`${schema.orders.openedAt} < now() - interval '1 hour'`
      )
    );
  const openOldN = Number(openOld?.n ?? 0);
  if (openOldN > 0) {
    const staleRows = await db
      .select({
        id: schema.orders.id,
        clientName: schema.clients.name,
        openedAt: schema.orders.openedAt,
        totalCents: schema.orders.totalCents,
        paidCents: sql<number>`(
          select coalesce(sum(${schema.payments.amountCents}), 0)::int
          from ${schema.payments}
          where ${schema.payments.orderId} = ${schema.orders.id}
        )`,
      })
      .from(schema.orders)
      .leftJoin(schema.clients, eq(schema.orders.clientId, schema.clients.id))
      .where(
        and(
          eq(schema.orders.tenantId, tenant.id),
          eq(schema.orders.status, "open"),
          isNull(schema.orders.deletedAt),
          sql`${schema.orders.openedAt} < now() - interval '1 hour'`
        )
      )
      .orderBy(asc(schema.orders.openedAt))
      .limit(5);

    alerts.push({
      id: "open-orders",
      severity: "warning",
      kind: "open_orders_stale",
      title: `${openOldN} comanda(s) aberta(s) há mais de 1 hora`,
      detail:
        staleRows
          .map((r) => {
            const paid = Number(r.paidCents ?? 0);
            const saldo = Math.max(0, r.totalCents - paid);
            const nome = r.clientName ?? "Sem cliente";
            return `${nome}: aberta ${r.openedAt.toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              hour: "2-digit",
              minute: "2-digit",
            })} · saldo R$ ${(saldo / 100).toFixed(2).replace(".", ",")}`;
          })
          .join(" · ") || "Verifique e finalize o pagamento.",
      count: openOldN,
      href: "/comandas",
      periodLabel: "agora",
    });
  }

  // Fase 4 — +5 min do horário e ainda não em atendimento
  const waitingRows = await db
    .select({
      id: schema.appointments.id,
      startsAt: schema.appointments.startsAt,
      status: schema.appointments.status,
      clientName: schema.clients.name,
      staffName: schema.staff.name,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .leftJoin(schema.staff, eq(schema.appointments.staffId, schema.staff.id))
    .where(
      and(
        eq(schema.appointments.tenantId, tenant.id),
        inArray(schema.appointments.status, ["scheduled", "confirmed", "arrived"]),
        isNull(schema.appointments.deletedAt),
        sql`${schema.appointments.startsAt} < now() - interval '5 minutes'`,
        sql`(${schema.appointments.startsAt} AT TIME ZONE 'America/Sao_Paulo')::date = ${today}::date`
      )
    )
    .orderBy(asc(schema.appointments.startsAt))
    .limit(20);

  if (waitingRows.length) {
    alerts.push({
      id: "waiting-overdue",
      severity: "critical",
      kind: "waiting_overdue",
      title: `${waitingRows.length} cliente(s) passaram do horário e ainda não foram atendidos`,
      detail: waitingRows
        .slice(0, 4)
        .map((r) => {
          const hm = r.startsAt.toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
          });
          return `${r.clientName ?? "Cliente"} ${hm}${r.staffName ? ` · ${r.staffName}` : ""} (${r.status})`;
        })
        .join(" · "),
      count: waitingRows.length,
      href: `/agenda?date=${today}`,
      periodLabel: "agora · +5 min",
    });
  }

  // Recorrência fechada ~10 dias sem remarcar
  const recurrenceCutoffIso = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString();
  const recurrenceFloorIso = new Date(Date.now() - 45 * 24 * 60 * 60_000).toISOString();
  const recurrenceRows = await db
    .select({
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      lastAt: sql<Date>`max(${schema.appointments.startsAt})`.as("last_at"),
    })
    .from(schema.clients)
    .innerJoin(
      schema.appointments,
      and(
        eq(schema.appointments.clientId, schema.clients.id),
        eq(schema.appointments.tenantId, schema.clients.tenantId)
      )
    )
    .innerJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        isNull(schema.clients.deletedAt),
        isNull(schema.appointments.deletedAt),
        inArray(schema.appointments.status, ["completed", "confirmed"]),
        sql`lower(${schema.services.name}) like '%recorr%'`
      )
    )
    .groupBy(schema.clients.id, schema.clients.name)
    .having(
      and(
        sql`max(${schema.appointments.startsAt}) <= ${recurrenceCutoffIso}::timestamptz`,
        sql`max(${schema.appointments.startsAt}) >= ${recurrenceFloorIso}::timestamptz`
      )
    )
    .limit(30);

  if (recurrenceRows.length) {
    alerts.push({
      id: "recurrence-unbooked",
      severity: "warning",
      kind: "recurrence_unbooked",
      title: `${recurrenceRows.length} cliente(s) de recorrência sem remarcar (~10 dias)`,
      detail: recurrenceRows
        .slice(0, 4)
        .map((r) => r.clientName)
        .join(" · "),
      count: recurrenceRows.length,
      href: "/relatorios/perfil?tab=recorrencia",
      periodLabel: "~10 dias",
    });
  }

  // Clientes “semanais” (2+ visitas em 21d) sem próximo horário
  const weeklyLookbackIso = new Date(Date.now() - 21 * 24 * 60 * 60_000).toISOString();
  const nowIso = new Date().toISOString();
  const weeklyCandidates = await db
    .select({
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      visits: sql<number>`count(*)::int`.as("visits"),
    })
    .from(schema.clients)
    .innerJoin(
      schema.appointments,
      and(
        eq(schema.appointments.clientId, schema.clients.id),
        eq(schema.appointments.tenantId, schema.clients.tenantId)
      )
    )
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        isNull(schema.clients.deletedAt),
        isNull(schema.appointments.deletedAt),
        eq(schema.appointments.status, "completed"),
        sql`${schema.appointments.startsAt} >= ${weeklyLookbackIso}::timestamptz`
      )
    )
    .groupBy(schema.clients.id, schema.clients.name)
    .having(sql`count(*) >= 2`)
    .limit(80);

  const weeklyUnbooked: { clientName: string }[] = [];
  for (const c of weeklyCandidates) {
    const [next] = await db
      .select({ id: schema.appointments.id })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.tenantId, tenant.id),
          eq(schema.appointments.clientId, c.clientId),
          isNull(schema.appointments.deletedAt),
          inArray(schema.appointments.status, ["scheduled", "confirmed", "arrived"]),
          sql`${schema.appointments.startsAt} >= ${nowIso}::timestamptz`
        )
      )
      .limit(1);
    if (!next) weeklyUnbooked.push({ clientName: c.clientName });
  }

  if (weeklyUnbooked.length) {
    alerts.push({
      id: "weekly-unbooked",
      severity: "warning",
      kind: "weekly_clients_unbooked",
      title: `${weeklyUnbooked.length} cliente(s) frequentes sem próximo horário`,
      detail: weeklyUnbooked
        .slice(0, 5)
        .map((c) => c.clientName)
        .join(" · "),
      count: weeklyUnbooked.length,
      href: "/relatorios/perfil",
      periodLabel: "21 dias · 2+ visitas",
    });
  }

  // Almoços sobrepostos: 3+ profissionais com janela livre 12–14 no mesmo bloco
  const weekdayNum = new Date(`${today}T12:00:00-03:00`).getDay();
  const bookableStaff = await db
    .select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, tenant.id),
        eq(schema.staff.isActive, true),
        eq(schema.staff.isBookable, true),
        isNull(schema.staff.deletedAt)
      )
    );
  if (bookableStaff.length >= 3) {
    const schedToday = await db
      .select({
        staffId: schema.staffSchedules.staffId,
        slotIndex: schema.staffSchedules.slotIndex,
        startTime: schema.staffSchedules.startTime,
        endTime: schema.staffSchedules.endTime,
      })
      .from(schema.staffSchedules)
      .where(
        and(
          eq(schema.staffSchedules.tenantId, tenant.id),
          eq(schema.staffSchedules.weekday, weekdayNum),
          eq(schema.staffSchedules.isActive, true)
        )
      );

    let overlappingLunch = 0;
    for (const st of bookableStaff) {
      const slots = schedToday
        .filter((s) => s.staffId === st.id)
        .sort((a, b) => a.slotIndex - b.slotIndex);
      if (slots.length >= 2) {
        const end1 = String(slots[0].endTime).slice(0, 5);
        const start2 = String(slots[1].startTime).slice(0, 5);
        if (end1 <= "12:30" && start2 >= "13:00" && start2 <= "14:30") {
          overlappingLunch += 1;
        }
      } else {
        // Sem turno partido → assume almoço padrão 12–14
        overlappingLunch += 1;
      }
    }
    if (overlappingLunch >= 3) {
      alerts.push({
        id: "lunch-overlap",
        severity: "info",
        kind: "lunch_overlap",
        title: `${overlappingLunch} profissionais com almoço na mesma faixa — escale os turnos`,
        detail:
          "Com 3+ na mesma janela, a agenda trava. Ajuste jornadas (turno 1 / turno 2) em Profissionais.",
        count: overlappingLunch,
        href: "/profissionais",
        periodLabel: "hoje",
      });
    }
  }

  const extrasWithStaff = (
    await sumClosedExtraServicesByStaff(db, tenant.id, weekStartIso, weekEndIso)
  )
    .filter((row) => row.staffName)
    .slice(0, 5);
  if (extrasWithStaff.length) {
    alerts.push({
      id: "staff-extras-week",
      severity: "info",
      kind: "staff_extras_week",
      title: "Extras da semana por profissional",
      detail: extrasWithStaff
        .map((e) => {
          const reais = (e.cents / 100).toFixed(0);
          return `${e.staffName}: ${e.qty} · R$ ${reais}`;
        })
        .join(" · "),
      count: extrasWithStaff.length,
      href: "/relatorios/extras",
      periodLabel: "semana",
    });
  }

  const seriesRows = await db
    .select({
      seriesId: sql<string>`${schema.appointments.meta}->>'seriesId'`,
      clientName: schema.clients.name,
    })
    .from(schema.appointments)
    .leftJoin(schema.clients, eq(schema.appointments.clientId, schema.clients.id))
    .where(
      and(
        eq(schema.appointments.tenantId, tenant.id),
        isNull(schema.appointments.deletedAt),
        sql`${schema.appointments.startsAt} > now()`,
        sql`${schema.appointments.status} not in ('cancelled', 'no_show', 'blocked')`,
        sql`${schema.appointments.meta}->>'seriesId' is not null`
      )
    )
    .limit(400);

  const seriesCount = new Map<string, { n: number; name: string }>();
  for (const row of seriesRows) {
    if (!row.seriesId) continue;
    const cur = seriesCount.get(row.seriesId) ?? { n: 0, name: row.clientName ?? "Cliente" };
    cur.n += 1;
    if (row.clientName) cur.name = row.clientName;
    seriesCount.set(row.seriesId, cur);
  }
  const ending = [...seriesCount.values()].filter((s) => s.n >= 1 && s.n <= 2);
  if (ending.length) {
    alerts.push({
      id: "series-ending",
      severity: "warning",
      kind: "series_ending",
      title:
        ending.length === 1
          ? `Série recorrente com ${ending[0].n} horário(s) restante(s)`
          : `${ending.length} séries recorrentes acabando`,
      detail: ending
        .slice(0, 6)
        .map((e) => `${e.name}: ${e.n} rest.`)
        .join(" · "),
      count: ending.length,
      href: "/agenda",
      periodLabel: "próximos",
    });
  }

  const weekdayNow = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });
  if (weekdayNow === "Thu" || weekdayNow === "Fri" || weekdayNow === "Sat") {
    const fullWeek = rangeBoundsSp(week.from, week.to);
    const weekFromIso = fullWeek.start.toISOString();
    const weekUntilIso = fullWeek.end.toISOString();
    const hasCredit = sql`exists (
      select 1
      from ${schema.clientPackageCredits}
      inner join ${schema.clientPackages}
        on ${schema.clientPackages.id} = ${schema.clientPackageCredits.clientPackageId}
      where ${schema.clientPackages.clientId} = ${schema.clients.id}
        and ${schema.clientPackages.tenantId} = ${tenant.id}
        and ${schema.clientPackages.status} = 'active'
        and ${schema.clientPackageCredits.remainingQty} > 0
        and (
          ${schema.clientPackages.expiresAt} is null
          or ${schema.clientPackages.expiresAt} > now()
        )
    )`;
    const missedSlot = sql`exists (
      select 1
      from ${schema.appointments}
      where ${schema.appointments.clientId} = ${schema.clients.id}
        and ${schema.appointments.tenantId} = ${tenant.id}
        and ${schema.appointments.deletedAt} is null
        and ${schema.appointments.startsAt} >= ${weekFromIso}::timestamptz
        and ${schema.appointments.startsAt} <= ${weekUntilIso}::timestamptz
        and (
          ${schema.appointments.status} = 'no_show'
          or (
            ${schema.appointments.startsAt} < now()
            and ${schema.appointments.status} in ('scheduled', 'confirmed')
          )
        )
    )`;
    const alreadyCame = sql`exists (
      select 1
      from ${schema.appointments}
      where ${schema.appointments.clientId} = ${schema.clients.id}
        and ${schema.appointments.tenantId} = ${tenant.id}
        and ${schema.appointments.deletedAt} is null
        and ${schema.appointments.startsAt} >= ${weekFromIso}::timestamptz
        and ${schema.appointments.startsAt} <= ${weekUntilIso}::timestamptz
        and ${schema.appointments.status} in ('completed', 'arrived', 'in_progress')
    )`;
    const missed = await db
      .select({
        clientName: schema.clients.name,
      })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.tenantId, tenant.id),
          eq(schema.clients.isActive, true),
          isNull(schema.clients.deletedAt),
          hasCredit,
          missedSlot,
          sql`not ${alreadyCame}`
        )
      )
      .limit(20);

    if (missed.length) {
      alerts.push({
        id: "weekly-missed-thursday",
        severity: "warning",
        kind: "weekly_missed_thursday",
        title:
          missed.length === 1
            ? `${missed[0].clientName ?? "Cliente"} faltou e ainda tem pacote`
            : `${missed.length} com pacote faltaram nesta semana`,
        detail: missed
          .slice(0, 8)
          .map((m) => m.clientName ?? "Cliente")
          .join(" · "),
        count: missed.length,
        href: "/agenda",
        periodLabel: "semana",
      });
    }
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
