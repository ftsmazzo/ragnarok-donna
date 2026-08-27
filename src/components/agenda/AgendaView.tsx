"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { AgendaDetailModal } from "@/components/agenda/AgendaDetailModal";
import { AgendaFormModal, type AgendaFormMode } from "@/components/agenda/AgendaFormModal";
import type {
  AgendaAppointment,
  AgendaDayData,
  AgendaPermissions,
  AgendaPickerService,
} from "@/server/agenda/types";
import { hourInSp } from "@/lib/datetime";
import {
  formatDateLabelSp,
  formatTimeSp,
  shiftDateSp,
  shortPersonName,
} from "@/lib/datetime";
import Link from "next/link";
import { Fragment } from "react";

type Props = {
  data: AgendaDayData;
  services: AgendaPickerService[];
  permissions: AgendaPermissions;
  staffFilter?: string;
  tabletMode?: boolean;
};

function slotClass(a: AgendaAppointment): string {
  if (a.status === "blocked") return "slot block";
  if (a.status === "no_show" || a.status === "cancelled") return "slot muted";
  if (a.isEncaixe) return "slot encaixe";
  return "slot";
}

function slotsForHour(
  appointments: AgendaAppointment[],
  staffId: string,
  hourLabel: string
): AgendaAppointment[] {
  const hour = Number(hourLabel.slice(0, 2));
  return appointments.filter((a) => {
    if (a.staffId !== staffId) return false;
    if (a.status === "cancelled") return false;
    return hourInSp(a.startsAt) === hour;
  });
}

export function AgendaView({
  data,
  services,
  permissions,
  staffFilter,
  tabletMode = false,
}: Props) {
  const router = useRouter();
  const prevDate = shiftDateSp(data.date, -1);
  const nextDate = shiftDateSp(data.date, 1);
  const dateLabel = formatDateLabelSp(data.date);
  const staffCols = Math.max(data.staff.length, 1);

  const [formMode, setFormMode] = useState<AgendaFormMode | null>(null);
  const [slot, setSlot] = useState<{ date: string; staffId: string; hour: number } | null>(
    null
  );
  const [detail, setDetail] = useState<AgendaAppointment | null>(null);

  function refresh() {
    router.refresh();
  }

  function qs(extra?: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    sp.set("date", extra?.date ?? data.date);
    const staff = extra && "staff" in extra ? extra.staff : staffFilter;
    if (staff) sp.set("staff", staff);
    const modo = extra && "modo" in extra ? extra.modo : tabletMode ? "tablet" : undefined;
    if (modo) sp.set("modo", modo);
    return `/agenda?${sp.toString()}`;
  }

  function staffHref(id?: string) {
    return qs({ staff: id });
  }

  function openSlot(staffId: string, hour: number, mode: AgendaFormMode) {
    setSlot({ date: data.date, staffId, hour });
    setFormMode(mode);
  }

  function openEncaixe() {
    const first = data.staff[0];
    if (!first) return;
    const hour = Number(data.hours[0]?.slice(0, 2) ?? 9);
    openSlot(first.id, hour, "encaixe");
  }

  return (
    <>
      <PageHeader
        title={tabletMode ? "Agenda · Mesa" : "Agenda"}
        subtitle={`${dateLabel} · ${data.totalAppointments} agendamento(s)`}
        actions={
          <>
            <Link
              href={tabletMode ? qs({ modo: undefined }) : qs({ modo: "tablet" })}
              className="btn btn-outline"
            >
              {tabletMode ? "Modo normal" : "Modo tablet"}
            </Link>
            <Link href={qs({ date: data.date })} className="btn btn-outline">
              Hoje
            </Link>
            <Link href={qs({ date: prevDate })} className="btn btn-outline">
              ← Anterior
            </Link>
            <Link href={qs({ date: nextDate })} className="btn btn-outline">
              Próximo →
            </Link>
            {permissions.canWrite ? (
              <button type="button" className="btn btn-primary" onClick={openEncaixe}>
                + Encaixe
              </button>
            ) : null}
          </>
        }
      />

      {data.staff.length > 1 && !permissions.scopedStaffId ? (
        <div className="panel-toolbar" style={{ marginBottom: 12 }}>
          <Link
            href={staffHref()}
            className={`chip${!staffFilter ? " is-on" : ""}`}
          >
            Todos
          </Link>
          {data.staff.map((s) => (
            <Link
              key={s.id}
              href={staffHref(s.id)}
              className={`chip${staffFilter === s.id ? " is-on" : ""}`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel-toolbar" style={{ marginBottom: 12 }}>
          {data.staff.map((s) => (
            <span key={s.id} className="chip is-on">
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div className={`agenda-layout${tabletMode ? " is-tablet" : ""}`}>
        <section>
          {data.staff.length === 0 ? (
            <div className="panel-empty">Nenhum profissional na agenda.</div>
          ) : (
            <div
              className="agenda-grid"
              style={{
                gridTemplateColumns: tabletMode
                  ? `72px repeat(${staffCols}, minmax(160px, 1fr))`
                  : `56px repeat(${staffCols}, minmax(120px, 1fr))`,
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
                    const hourNum = Number(hour.slice(0, 2));
                    const slots = slotsForHour(data.appointments, s.id, hour);
                    const hasSlot = slots.length > 0;

                    return (
                      <div
                        key={`${s.id}-${hour}`}
                        className={`agenda-cell${permissions.canWrite && !hasSlot ? " is-clickable" : ""}`}
                        onClick={() => {
                          if (permissions.canWrite && !hasSlot) {
                            openSlot(s.id, hourNum, "schedule");
                          }
                        }}
                        onContextMenu={(e) => {
                          if (!permissions.canWrite) return;
                          e.preventDefault();
                          openSlot(s.id, hourNum, "block");
                        }}
                        title={
                          permissions.canWrite && !hasSlot
                            ? "Clique: agendar · Botão direito: bloquear"
                            : undefined
                        }
                      >
                        {slots.map((a) => (
                          <div
                            key={a.id}
                            className={slotClass(a)}
                            style={
                              s.color && a.status !== "blocked"
                                ? { background: s.color }
                                : undefined
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetail(a);
                            }}
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
            {permissions.canWrite ? (
              <span className="legend-hint">Clique vazio: agendar · Direito: bloquear</span>
            ) : null}
          </div>
        </section>

        {!tabletMode ? (
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
        ) : (
          <aside className="agenda-tablet-strip">
            <div className="side-card">
              <h3>Hoje</h3>
              <div className="body">
                <strong style={{ fontSize: 28 }}>{data.totalAppointments}</strong>
                <br />
                agendamentos · toque no horário para ver
              </div>
            </div>
          </aside>
        )}
      </div>

      {formMode && slot ? (
        <AgendaFormModal
          open
          mode={formMode}
          slot={slot}
          staff={data.staff}
          services={services}
          onClose={() => {
            setFormMode(null);
            setSlot(null);
          }}
          onSaved={refresh}
        />
      ) : null}

      {detail ? (
        <AgendaDetailModal
          open
          appointment={detail}
          date={data.date}
          permissions={permissions}
          onClose={() => setDetail(null)}
          onSaved={refresh}
        />
      ) : null}
    </>
  );
}
