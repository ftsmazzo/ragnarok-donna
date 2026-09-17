"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { StaffPerformance } from "@/server/staff/performance";
import { StaffPerformanceFilters } from "@/components/staff/StaffPerformanceFilters";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelOrderStatus } from "@/lib/format";
import { saveStaffClientGoalAction } from "@/app/(painel)/profissionais/actions";

type Props = {
  staffId: string;
  performance: StaffPerformance;
  listFilter?: string;
  listQ?: string;
  /** Dono/admin pode editar meta de clientes */
  canEditClientGoal?: boolean;
};

function formatPeriod(from: string, to: string) {
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

function deltaLabel(pct: number | null): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("pt-BR")}%`;
}

export function StaffPerformancePanel({
  staffId,
  performance: p,
  listFilter,
  listQ,
  canEditClientGoal = false,
}: Props) {
  const router = useRouter();
  const mgmt = p.management;
  const goal = p.clientGoal;
  const [goalInput, setGoalInput] = useState(
    goal?.target != null ? String(goal.target) : ""
  );
  const [goalMsg, setGoalMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    setGoalMsg(null);
    const n = goalInput.trim() === "" ? null : Number(goalInput.replace(",", "."));
    startTransition(async () => {
      const result = await saveStaffClientGoalAction(
        staffId,
        n != null && Number.isFinite(n) ? Math.floor(n) : null
      );
      if (!result.ok) {
        setGoalMsg(result.error);
        return;
      }
      setGoalMsg("Meta salva.");
      router.refresh();
    });
  }

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
        {" · "}
        vs anterior ({formatPeriod(p.previous.prevFrom, p.previous.prevTo)})
      </p>

      <div className="client-stats">
        <div className="client-stat">
          <span className="meta-label">Faturamento fechado</span>
          <strong>{formatMoney(p.revenueClosedCents)}</strong>
          <span className="staff-delta muted">{deltaLabel(p.previous.revenueDeltaPct)}</span>
        </div>
        <div className="client-stat">
          <span className="meta-label">Ticket médio</span>
          <strong>{formatMoney(p.ticketAvgCents)}</strong>
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
          <span className="meta-label">Comandas fechadas</span>
          <strong>{p.ordersClosed.toLocaleString("pt-BR")}</strong>
          <span className="staff-delta muted">{deltaLabel(p.previous.ordersDeltaPct)}</span>
        </div>
        <div className="client-stat">
          <span className="meta-label">Atendimentos (itens serviço)</span>
          <strong>{p.serviceItemsCount.toLocaleString("pt-BR")}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Produtos / extras</span>
          <strong>
            {p.productsQty.toLocaleString("pt-BR")} · {formatMoney(p.productsCents)}
          </strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Pacotes (R$)</span>
          <strong>{formatMoney(p.packagesCents)}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Descontos (itens)</span>
          <strong>{formatMoney(p.discountCents)}</strong>
        </div>
        <div className="client-stat">
          <span className="meta-label">Comandas abertas</span>
          <strong>{p.ordersOpen.toLocaleString("pt-BR")}</strong>
        </div>
      </div>

      <div className="client-profile-block">
        <h3 className="client-profile-heading">Clientes no período</h3>
        <div className="client-stats">
          <div className="client-stat">
            <span className="meta-label">Atendidos</span>
            <strong>{p.cohorts.served.toLocaleString("pt-BR")}</strong>
            <span className="staff-delta muted">{deltaLabel(p.previous.clientsDeltaPct)}</span>
          </div>
          <div className="client-stat">
            <span className="meta-label">Novos</span>
            <strong>{p.cohorts.newcomers.toLocaleString("pt-BR")}</strong>
          </div>
          <div className="client-stat">
            <span className="meta-label">Que retornaram</span>
            <strong>{p.cohorts.returning.toLocaleString("pt-BR")}</strong>
          </div>
          <div className="client-stat">
            <span className="meta-label">Sem retorno 30–90d</span>
            <strong>{p.cohorts.lapsed30.toLocaleString("pt-BR")}</strong>
          </div>
        </div>
        <p className="client-profile-hint muted">
          Novos = primeira visita na loja no período. Retornaram = já vinham antes.
          Sem retorno = última visita com este profissional há 30–90 dias.
        </p>
      </div>

      {goal || canEditClientGoal ? (
        <div className="client-profile-block">
          <h3 className="client-profile-heading">Meta de clientes</h3>
          {goal ? (
            <div className="client-stats">
              <div className="client-stat">
                <span className="meta-label">Progresso</span>
                <strong>
                  {goal.current}/{goal.target} ({goal.progressPct ?? 0}%)
                </strong>
              </div>
              <div className="client-stat">
                <span className="meta-label">Faltam</span>
                <strong>
                  {goal.remaining === 0
                    ? "Meta batida"
                    : `${goal.remaining.toLocaleString("pt-BR")} cliente(s)`}
                </strong>
              </div>
            </div>
          ) : (
            <p className="client-profile-hint muted">Nenhuma meta definida para este profissional.</p>
          )}
          {canEditClientGoal ? (
            <form className="staff-goal-form" onSubmit={saveGoal}>
              <label className="form-field">
                <span>Meta mensal (clientes distintos)</span>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Ex.: 80"
                />
              </label>
              <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
                {pending ? "Salvando…" : "Salvar meta"}
              </button>
              {goalMsg ? <span className="client-profile-hint">{goalMsg}</span> : null}
            </form>
          ) : null}
        </div>
      ) : null}

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
