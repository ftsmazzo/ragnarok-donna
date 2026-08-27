"use client";

import type { StaffPerformance } from "@/server/staff/performance";
import { StaffPerformanceFilters } from "@/components/staff/StaffPerformanceFilters";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelOrderStatus } from "@/lib/format";

type Props = {
  staffId: string;
  performance: StaffPerformance;
  listFilter?: string;
  listQ?: string;
};

function formatPeriod(from: string, to: string) {
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

export function StaffPerformancePanel({ staffId, performance: p, listFilter, listQ }: Props) {
  const mgmt = p.management;

  return (
    <div className="client-profile-section">
      <StaffPerformanceFilters
        staffId={staffId}
        from={p.from}
        to={p.to}
        filter={listFilter}
        q={listQ}
      />

      <p className="client-profile-hint">
        Período: <strong>{formatPeriod(p.from, p.to)}</strong>
      </p>

      <div className="client-stats">
        <div className="client-stat">
          <span className="meta-label">Faturamento fechado</span>
          <strong>{formatMoney(p.revenueClosedCents)}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Comissão fechada</span>
          <strong>{formatMoney(p.commissionClosedCents)}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Comissão em aberto</span>
          <strong>{formatMoney(p.commissionOpenCents)}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Descontos (itens)</span>
          <strong>{formatMoney(p.discountCents)}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Comandas fechadas</span>
          <strong>{p.ordersClosed.toLocaleString("pt-BR")}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Comandas abertas</span>
          <strong>{p.ordersOpen.toLocaleString("pt-BR")}</strong>
        </div>
      </div>

      {mgmt ? (
        <div className="staff-mgmt-metrics">
          <h3 className="client-profile-heading">Indicadores de gestão</h3>
          <div className="client-stats">
            <div className="client-stat staff-stat-alert">
              <span className="meta-label">Taxa cancelamento + ausência</span>
              <strong>{mgmt.cancellationRatePct.toLocaleString("pt-BR")}%</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Agendamentos no período</span>
              <strong>{mgmt.appointmentsTotal.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Cancelados</span>
              <strong>{mgmt.cancelledCount.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Ausências (no-show)</span>
              <strong>{mgmt.noShowCount.toLocaleString("pt-BR")}</strong>
            </div>
          </div>
          <p className="client-profile-hint muted">
            Visível apenas para gestão. Considera cancelados + ausentes sobre agendamentos do
            período (exceto bloqueios).
          </p>
        </div>
      ) : null}

      {p.topServices.length > 0 ? (
        <div className="client-profile-block">
          <h3 className="client-profile-heading">Serviços no período</h3>
          <ul className="client-top-list">
            {p.topServices.map((s) => (
              <li key={s.description}>
                <span>{s.description}</span>
                <span>
                  {s.count}x · {formatMoney(s.totalCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.recentOrders.length > 0 ? (
        <div className="client-profile-block">
          <h3 className="client-profile-heading">Comandas recentes</h3>
          <ul className="client-timeline">
            {p.recentOrders.map((o) => (
              <li key={o.id} className="client-timeline-item">
                <div className="client-timeline-main">
                  <strong>
                    {o.externalId ? `Comanda #${o.externalId}` : formatDateTimeSp(o.openedAt)}
                  </strong>
                  <span>{formatDateTimeSp(o.openedAt)}</span>
                </div>
                <div className="client-timeline-meta">
                  <span>{labelOrderStatus(o.status)}</span>
                  <span>{formatMoney(o.totalCents)}</span>
                  <span>Comissão {formatMoney(o.commissionCents)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="client-profile-empty">
          Nenhuma comanda com itens deste profissional no período.
        </p>
      )}
    </div>
  );
}
