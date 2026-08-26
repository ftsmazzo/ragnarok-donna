import { PageHeader } from "@/components/shell/PageHeader";
import { Fragment } from "react";

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const STAFF = ["Diego", "Luciano", "Barbeiro 3"];

export default function AgendaPage() {
  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle="Dia · visão operacional (mock — dados reais após import)"
        actions={
          <>
            <button type="button" className="btn btn-outline">
              Dia
            </button>
            <button type="button" className="btn btn-outline">
              Semana
            </button>
            <button type="button" className="btn btn-primary">
              + Encaixe
            </button>
          </>
        }
      />

      <div className="panel-toolbar" style={{ marginBottom: 12 }}>
        {STAFF.map((name, i) => (
          <span key={name} className={`chip${i === 0 ? " is-on" : ""}`}>
            {name}
          </span>
        ))}
      </div>

      <div className="agenda-layout">
        <section>
          <div className="agenda-grid">
            <div className="agenda-head" />
            {STAFF.map((name) => (
              <div key={name} className="agenda-head">
                {name}
              </div>
            ))}

            {HOURS.map((hour, row) => (
              <Fragment key={hour}>
                <div className="agenda-time">{hour}</div>
                {STAFF.map((name, col) => (
                  <div key={`${name}-${hour}`} className="agenda-cell">
                    {row === 1 && col === 0 ? (
                      <div className="slot">
                        <strong>Carlos M.</strong>
                        <br />
                        Corte + Barba
                      </div>
                    ) : null}
                    {row === 3 && col === 1 ? (
                      <div className="slot block">Bloqueio</div>
                    ) : null}
                    {row === 5 && col === 0 ? (
                      <div className="slot">
                        <strong>João P.</strong>
                        <br />
                        Barba
                      </div>
                    ) : null}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>

          <div className="legend">
            <span>
              <i style={{ background: "var(--slot)" }} /> Agendado
            </span>
            <span>
              <i style={{ background: "var(--slot-block)" }} /> Bloqueio
            </span>
            <span>
              <i style={{ background: "#9ca3af" }} /> Fora do expediente
            </span>
          </div>
        </section>

        <aside>
          <div className="side-card">
            <h3>Horários disponíveis</h3>
            <div className="body">14:30 · 15:00 · 16:30</div>
          </div>
          <div className="side-card">
            <h3>Lista de espera</h3>
            <div className="body">2 clientes aguardando encaixe</div>
          </div>
          <div className="side-card">
            <h3>Comandas abertas</h3>
            <div className="body">3 comandas do dia</div>
          </div>
        </aside>
      </div>
    </>
  );
}
