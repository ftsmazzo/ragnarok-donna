import type { OutreachMetrics } from "@/server/outreach/metrics";

type Props = { metrics: OutreachMetrics };

const KIND_LABEL: Record<string, string> = {
  confirmation_daily: "Confirmação de amanhã",
  followup_inactive: "Convite de retorno",
  empty_agenda: "Horário livre",
  birthday: "Aniversário",
  sunday_blast: "Mensagem de domingo",
  voce_vem: "Você vem?",
  delay_reschedule: "Remarcação",
  manual: "Manual",
  campaign: "Campanha",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Enviada",
  dry_run: "Só teste",
  pending: "Na fila",
  failed: "Falhou",
  sending: "Enviando",
};

export function OutreachMetricsPanel({ metrics }: Props) {
  const sendingLive = metrics.dispatchEnabled && !metrics.dryRunActive;

  return (
    <section className="disparos-status panel">
      <div className="panel-body">
        <div className={`disparos-status-banner${sendingLive ? " is-live" : " is-safe"}`}>
          <div>
            <p className="disparos-status-kicker">Situação agora</p>
            <h3 className="disparos-status-title">
              {sendingLive
                ? "Mensagens podem ir para o WhatsApp dos clientes"
                : "Modo seguro — nada chega no WhatsApp do cliente"}
            </h3>
            <p className="disparos-status-desc">
              {sendingLive
                ? "O envio real está liberado. Use com calma: confirme o texto e o horário antes de aumentar o volume."
                : "Pode ligar a confirmação e treinar os textos. O sistema só simula a fila — o cliente não recebe nada até liberarmos o envio de verdade."}
            </p>
          </div>
          <span className={`disparos-pill${sendingLive ? " is-warn" : " is-ok"}`}>
            {sendingLive ? "Envio real" : "Só teste"}
          </span>
        </div>

        <div className="disparos-metrics">
          <Metric
            label="Enviadas hoje"
            value={String(metrics.sentToday)}
            hint="Chegaram no WhatsApp"
          />
          <Metric
            label="Só teste hoje"
            value={String(metrics.dryRunToday)}
            hint="Simuladas, sem Zap"
          />
          <Metric
            label="Na fila"
            value={String(metrics.pending)}
            hint="Esperando a hora"
          />
          <Metric
            label="Falharam hoje"
            value={String(metrics.failedToday)}
            hint="Precisam olhar"
          />
          <Metric
            label="Nesta hora"
            value={`${metrics.sentLastHour} de ${metrics.hourlyCap}`}
            hint="Limite pra não saturar"
          />
          <Metric
            label="Máx. no dia"
            value={String(metrics.dailyCap)}
            hint="Teto diário da unidade"
          />
        </div>

        {metrics.recentBodies.length ? (
          <div className="disparos-recent">
            <h4 className="disparos-recent-title">Últimas mensagens montadas</h4>
            <p className="disparos-recent-hint">
              Assim você vê se os textos estão saindo diferentes (menos cara de robô).
            </p>
            <ul className="disparos-recent-list">
              {metrics.recentBodies.map((r) => (
                <li key={r.id} className="disparos-recent-item">
                  <div className="disparos-recent-meta">
                    <span className="disparos-chip">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
                    <span className="muted">tel {r.phoneTail}</span>
                  </div>
                  <p className="disparos-recent-body">{r.bodyPreview}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="disparos-empty muted">
            Ainda não tem mensagem na fila. Ligue a confirmação de amanhã (abaixo) e salve —
            depois aparece aqui o que o sistema montaria.
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="disparos-metric">
      <div className="disparos-metric-label">{label}</div>
      <div className="disparos-metric-value">{value}</div>
      <div className="disparos-metric-hint">{hint}</div>
    </div>
  );
}
