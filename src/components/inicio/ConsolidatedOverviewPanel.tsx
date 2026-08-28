import type { ConsolidatedOverview } from "@/server/insights/consolidated";
import { formatMoney } from "@/lib/format";

type Props = {
  data: ConsolidatedOverview;
};

export function ConsolidatedOverviewPanel({ data }: Props) {
  return (
    <div className="consolidated-panel banner-info banner-inline">
      <h3 className="panel-subtitle">Visão consolidada — comparativo por unidade</h3>
      <div className="consolidated-grid">
        {data.branches.map((b) => (
          <div key={b.slug} className="consolidated-card panel">
            <div className="panel-body">
              <strong>{b.name.replace(/^Donna Elegant — /, "")}</strong>
              {b.staff === 0 ? (
                <p className="client-profile-hint muted">Unidade ainda sem equipe operacional</p>
              ) : (
                <ul className="consolidated-stats">
                  <li>
                    <span>Profissionais</span>
                    <strong>{b.staff.toLocaleString("pt-BR")}</strong>
                  </li>
                  <li>
                    <span>Agenda hoje</span>
                    <strong>{b.appointmentsToday.toLocaleString("pt-BR")}</strong>
                  </li>
                  <li>
                    <span>Clientes hoje</span>
                    <strong>{b.clientsToday.toLocaleString("pt-BR")}</strong>
                  </li>
                  <li>
                    <span>Comandas abertas</span>
                    <strong>{b.openOrdersToday.toLocaleString("pt-BR")}</strong>
                  </li>
                  <li>
                    <span>Faturamento hoje</span>
                    <strong>{formatMoney(b.revenueTodayCents)}</strong>
                  </li>
                  <li>
                    <span>Faturamento mês</span>
                    <strong>{formatMoney(b.revenueMonthCents)}</strong>
                  </li>
                </ul>
              )}
            </div>
          </div>
        ))}
        <div className="consolidated-card panel consolidated-total">
          <div className="panel-body">
            <strong>Total rede</strong>
            <ul className="consolidated-stats">
              <li>
                <span>Profissionais</span>
                <strong>{data.totals.staff.toLocaleString("pt-BR")}</strong>
              </li>
              <li>
                <span>Agenda hoje</span>
                <strong>{data.totals.appointmentsToday.toLocaleString("pt-BR")}</strong>
              </li>
              <li>
                <span>Faturamento hoje</span>
                <strong>{formatMoney(data.totals.revenueTodayCents)}</strong>
              </li>
              <li>
                <span>Faturamento mês</span>
                <strong>{formatMoney(data.totals.revenueMonthCents)}</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <p className="client-profile-hint muted">
        Operação (agendar, comanda, caixa) continua em uma unidade por vez. Use U01 ou U02 nos
        botões acima.
      </p>
    </div>
  );
}
