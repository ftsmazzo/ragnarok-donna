import type { OutreachMetrics } from "@/server/outreach/metrics";

type Props = { metrics: OutreachMetrics };

export function OutreachMetricsPanel({ metrics }: Props) {
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-body">
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Status anti-ban</h3>
        <p className="client-profile-hint muted" style={{ marginTop: 0 }}>
          {metrics.dispatchEnabled
            ? metrics.dryRunActive
              ? "Dispatch on, mas dry-run ativo — nada sai no WhatsApp."
              : "Envio real ligado. Caps e variantes ativos."
            : "Dispatch off. Fila pode rodar em dry-run (sem Evolution)."}
        </p>
        <div
          className="config-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}
        >
          <Metric label="Hoje (sent)" value={String(metrics.sentToday)} />
          <Metric label="Hoje (dry-run)" value={String(metrics.dryRunToday)} />
          <Metric label="Falhas hoje" value={String(metrics.failedToday)} />
          <Metric label="Pending" value={String(metrics.pending)} />
          <Metric
            label="Última hora"
            value={`${metrics.sentLastHour}/${metrics.hourlyCap}`}
          />
          <Metric label="Teto diário" value={String(metrics.dailyCap)} />
          <Metric
            label="Sunday blast"
            value={metrics.sundayBlastHardAllowed ? "liberado" : "bloqueado"}
          />
        </div>

        {metrics.recentBodies.length ? (
          <div style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 13 }}>Últimos textos (amostra)</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
              {metrics.recentBodies.map((r) => (
                <li key={r.id} style={{ marginBottom: 6 }}>
                  <span className="muted">
                    [{r.status}] {r.kind}
                    {r.variantIndex != null ? ` v${r.variantIndex}` : ""} {r.phoneTail}
                  </span>
                  <br />
                  {r.bodyPreview}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Nenhum job ainda — ligue dry-run + confirmação e rode o tick para ver variantes.
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 10px",
        background: "var(--panel)",
      }}
    >
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: 16 }}>{value}</div>
    </div>
  );
}
