import { PageHeader } from "@/components/shell/PageHeader";
import {
  getAgendaDay,
  groupAppointmentsByStaffHour,
  type AgendaAppointment,
} from "@/lib/agenda";
import {
  formatDateLabelSp,
  formatTimeSp,
  shiftDateSp,
  shortPersonName,
} from "@/lib/datetime";
import Link from "next/link";
import { Fragment } from "react";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ date?: string }>;
};

function slotClass(a: AgendaAppointment): string {
  if (a.status === "blocked") return "slot block";
  if (a.status === "no_show" || a.status === "cancelled") return "slot muted";
  return "slot";
}

export default async function AgendaPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams;
  const data = await getAgendaDay(dateParam);
  const prevDate = shiftDateSp(data.date, -1);
  const nextDate = shiftDateSp(data.date, 1);
  const dateLabel = formatDateLabelSp(data.date);
  const staffCols = Math.max(data.staff.length, 1);

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={`${dateLabel} · ${data.totalAppointments} agendamento(s)`}
        actions={
          <>
            <Link href={`/agenda?date=${data.date}`} className="btn btn-outline">
              Hoje
            </Link>
            <Link href={`/agenda?date=${prevDate}`} className="btn btn-outline">
              ← Anterior
            </Link>
            <Link href={`/agenda?date=${nextDate}`} className="btn btn-outline">
              Próximo →
            </Link>
            <button type="button" className="btn btn-primary" disabled title="Em breve">
              + Encaixe
            </button>
          </>
        }
      />

      <div className="panel-toolbar" style={{ marginBottom: 12 }}>
        {data.staff.map((s, i) => (
          <span key={s.id} className={`chip${i === 0 ? " is-on" : ""}`}>
            {s.name}
          </span>
        ))}
      </div>

      <div className="agenda-layout">
        <section>
          {data.staff.length === 0 ? (
            <div className="panel-empty">Nenhum profissional cadastrado.</div>
          ) : (
            <div
              className="agenda-grid"
              style={{
                gridTemplateColumns: `56px repeat(${staffCols}, minmax(120px, 1fr))`,
              }}
            >
              <div className="agenda-head" />
              {data.staff.map((s) => (
                <div key={s.id} className="agenda-head">
                  {s.name}
                </div>
              ))}

              {data.hours.map((hour) => (
                <Fragment key={hour}>
                  <div className="agenda-time">{hour}</div>
                  {data.staff.map((s) => {
                    const slots = groupAppointmentsByStaffHour(
                      data.appointments,
                      s.id,
                      hour
                    );
                    return (
                      <div key={`${s.id}-${hour}`} className="agenda-cell">
                        {slots.map((a) => (
                          <div
                            key={a.id}
                            className={slotClass(a)}
                            style={
                              s.color && a.status !== "blocked"
                                ? { background: s.color }
                                : undefined
                            }
                            title={`${formatTimeSp(a.startsAt)} – ${formatTimeSp(a.endsAt)}`}
                          >
                            <strong>{shortPersonName(a.clientName)}</strong>
                            {a.isEncaixe ? " · encaixe" : null}
                            <br />
                            {a.serviceName ?? (a.status === "blocked" ? "Bloqueio" : "—")}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          )}

          <div className="legend">
            <span>
              <i style={{ background: "var(--slot)" }} /> Agendado
            </span>
            <span>
              <i style={{ background: "var(--slot-block)" }} /> Bloqueio
            </span>
            <span>
              <i style={{ background: "#9ca3af" }} /> Cancelado / ausente
            </span>
          </div>
        </section>

        <aside>
          <div className="side-card">
            <h3>Resumo do dia</h3>
            <div className="body">
              {data.totalAppointments} agendamento(s)
              <br />
              {data.staff.length} profissional(is) na grade
            </div>
          </div>
          <div className="side-card">
            <h3>Lista de espera</h3>
            <div className="body">
              {data.waitlistCount > 0
                ? `${data.waitlistCount} cliente(s) aguardando encaixe`
                : "Nenhum cliente na fila"}
            </div>
          </div>
          <div className="side-card">
            <h3>Comandas abertas</h3>
            <div className="body">
              {data.openOrdersCount > 0
                ? `${data.openOrdersCount} comanda(s) aberta(s) hoje`
                : "Nenhuma comanda aberta hoje"}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
