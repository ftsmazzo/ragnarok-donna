"use client";

import type { ClientDetail, ClientProfile } from "@/server/clients/queries";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelApptStatus, labelOrderStatus } from "@/lib/format";

type Tab = "resumo" | "cadastro" | "agenda" | "comandas";

type Props = {
  client: ClientDetail;
  profile: ClientProfile;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  cadastroForm: React.ReactNode;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "cadastro", label: "Cadastro" },
  { id: "agenda", label: "Agenda" },
  { id: "comandas", label: "Comandas" },
];

export function ClientProfilePanel({ client, profile, tab, onTabChange, cadastroForm }: Props) {
  const { stats, recentAppointments, recentOrders } = profile;
  const prefEntries = Object.entries(client.preferences ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  return (
    <>
      <nav className="drawer-tabs" aria-label="Seções da ficha">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "drawer-tab is-active" : "drawer-tab"}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
            {t.id === "agenda" && stats.appointmentsTotal > 0 ? (
              <span className="drawer-tab-badge">{stats.appointmentsTotal}</span>
            ) : null}
            {t.id === "comandas" && stats.ordersTotal > 0 ? (
              <span className="drawer-tab-badge">{stats.ordersTotal}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "resumo" ? (
        <div className="client-profile-section">
          <div className="client-stats">
            <div className="client-stat">
              <span className="meta-label">Agendamentos</span>
              <strong>{stats.appointmentsTotal.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Comandas fechadas</span>
              <strong>{stats.ordersClosed.toLocaleString("pt-BR")}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Total consumido</span>
              <strong>{formatMoney(stats.totalSpentCents)}</strong>
            </div>
            <div className="client-stat">
              <span className="meta-label">Pontos fidelidade</span>
              <strong>{client.loyaltyPoints.toLocaleString("pt-BR")}</strong>
            </div>
          </div>

          {stats.lastVisitAt ? (
            <p className="client-profile-hint">
              Último agendamento: <strong>{formatDateTimeSp(stats.lastVisitAt)}</strong>
            </p>
          ) : (
            <p className="client-profile-hint">Nenhum agendamento registrado para este cliente.</p>
          )}

          {client.notes ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Observações</h3>
              <p className="client-profile-text">{client.notes}</p>
            </div>
          ) : null}

          {client.tags.length > 0 ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Tags</h3>
              <div className="client-tag-list">
                {client.tags.map((tag) => (
                  <span key={tag} className="client-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {prefEntries.length > 0 ? (
            <div className="client-profile-block">
              <h3 className="client-profile-heading">Preferências</h3>
              <dl className="client-pref-list">
                {prefEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="client-profile-hint muted">
              Preferências estruturadas (profissional favorito, tom de corte…) entram em{" "}
              <em>Preferências</em> e alimentam o agente WhatsApp — em breve editáveis aqui.
            </p>
          )}
        </div>
      ) : null}

      {tab === "cadastro" ? cadastroForm : null}

      {tab === "agenda" ? (
        <div className="client-profile-section">
          {recentAppointments.length === 0 ? (
            <p className="client-profile-empty">Nenhum agendamento no histórico.</p>
          ) : (
            <ul className="client-timeline">
              {recentAppointments.map((a) => (
                <li key={a.id} className="client-timeline-item">
                  <div className="client-timeline-main">
                    <strong>{formatDateTimeSp(a.startsAt)}</strong>
                    <span>{a.serviceName ?? "Serviço não informado"}</span>
                  </div>
                  <div className="client-timeline-meta">
                    <span>{labelApptStatus(a.status)}</span>
                    {a.staffName ? <span>{a.staffName}</span> : null}
                    {a.priceCents != null ? <span>{formatMoney(a.priceCents)}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {stats.appointmentsTotal > recentAppointments.length ? (
            <p className="client-profile-hint">
              Mostrando os {recentAppointments.length} mais recentes de{" "}
              {stats.appointmentsTotal.toLocaleString("pt-BR")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "comandas" ? (
        <div className="client-profile-section">
          {recentOrders.length === 0 ? (
            <p className="client-profile-empty">Nenhuma comanda vinculada a este cliente.</p>
          ) : (
            <ul className="client-timeline">
              {recentOrders.map((o) => (
                <li key={o.id} className="client-timeline-item">
                  <div className="client-timeline-main">
                    <strong>
                      {o.externalId ? `#${o.externalId}` : formatDateTimeSp(o.openedAt)}
                    </strong>
                    <span>{formatDateTimeSp(o.openedAt)}</span>
                  </div>
                  <div className="client-timeline-meta">
                    <span>{labelOrderStatus(o.status)}</span>
                    <span>
                      {o.itemCount} item(ns) · {formatMoney(o.totalCents)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {stats.ordersTotal > recentOrders.length ? (
            <p className="client-profile-hint">
              Mostrando as {recentOrders.length} mais recentes de{" "}
              {stats.ordersTotal.toLocaleString("pt-BR")}.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
