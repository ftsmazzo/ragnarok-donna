"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { AgendaDetailModal } from "@/components/agenda/AgendaDetailModal";
import { AgendaEditModal } from "@/components/agenda/AgendaEditModal";
import { ContaRecorrenciaModal } from "@/components/agenda/ContaRecorrenciaModal";
import { AgendaFormModal, type AgendaFormMode } from "@/components/agenda/AgendaFormModal";
import {
  AgendaContextMenu,
  type AgendaCtxTarget,
} from "@/components/agenda/AgendaContextMenu";
import { AgendaAside } from "@/components/agenda/AgendaAside";
import { AgendaQuickThinkWidget } from "@/components/agenda/AgendaQuickThinkWidget";
import { OrderDrawer } from "@/components/comandas/OrderDrawer";
import { PersonAvatar } from "@/components/cadastro/PersonAvatar";
import { openOrderFromAppointmentAction } from "@/app/(painel)/comandas/actions";
import type {
  AgendaAppointment,
  AgendaDayData,
  AgendaPermissions,
  AgendaPickerService,
} from "@/server/agenda/types";
import type {
  CatalogPackage,
  CatalogProduct,
  CatalogService,
  CatalogStaff,
  OrderDetail,
  OrderPermissions,
} from "@/server/orders/types";
import {
  formatDateLabelSp,
  formatTimeSp,
  hourInSp,
  minuteInSp,
  shiftDateSp,
  shortPersonName,
  todaySp,
} from "@/lib/datetime";
import { useAgendaNow } from "@/components/agenda/useAgendaNow";

type Props = {
  data: AgendaDayData;
  services: AgendaPickerService[];
  permissions: AgendaPermissions;
  staffFilter?: string;
  tabletMode?: boolean;
  orderCatalog?: {
    services: CatalogService[];
    products: CatalogProduct[];
    packages: CatalogPackage[];
    staff: CatalogStaff[];
  };
  orderPermissions?: OrderPermissions;
  selectedOrder?: OrderDetail | null;
};

function slotClass(a: AgendaAppointment): string {
  if (a.status === "blocked") return "slot block";
  if (a.status === "no_show" || a.status === "cancelled") return "slot muted";
  if (a.status === "confirmed") return "slot confirmed";
  if (a.status === "arrived" || a.status === "in_progress") return "slot active";
  if (a.isEncaixe) return "slot encaixe";
  return "slot";
}

/** Altura/topo do card na grade de 30 min (célula ~40px). */
function slotSpanStyle(a: AgendaAppointment): React.CSSProperties {
  const durationMin = Math.max(
    5,
    Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000)
  );
  const offsetMin = minuteInSp(a.startsAt) % 30;
  const span = durationMin / 30;
  return {
    position: "absolute",
    left: 2,
    right: 2,
    top: `calc(${(offsetMin / 30) * 100}% + 1px)`,
    height: `calc(${span * 100}% - 2px)`,
    zIndex: 2,
    marginBottom: 0,
    boxSizing: "border-box",
    overflow: "hidden",
  };
}

function parseSlotLabel(hourLabel: string): { hour: number; minute: number } {
  const [hRaw, mRaw] = hourLabel.split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw ?? 0) === 30 ? 30 : 0;
  return { hour, minute };
}

function slotsForLabel(
  appointments: AgendaAppointment[],
  staffId: string,
  hourLabel: string
): AgendaAppointment[] {
  const { hour, minute } = parseSlotLabel(hourLabel);
  return appointments.filter((a) => {
    if (a.staffId !== staffId) return false;
    if (a.status === "cancelled") return false;
    if (hourInSp(a.startsAt) !== hour) return false;
    const bucket = minuteInSp(a.startsAt) >= 30 ? 30 : 0;
    return bucket === minute;
  });
}

function slotBusy(
  appointments: AgendaAppointment[],
  staffId: string,
  date: string,
  hour: number,
  minute: number
): boolean {
  const start = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`
  );
  const end = new Date(start.getTime() + 30 * 60_000);
  return appointments.some((a) => {
    if (a.staffId !== staffId) return false;
    if (a.status === "cancelled" || a.status === "no_show") return false;
    return a.startsAt < end && a.endsAt > start;
  });
}

export function AgendaView({
  data,
  services,
  permissions,
  staffFilter,
  tabletMode = false,
  orderCatalog,
  orderPermissions,
  selectedOrder = null,
}: Props) {
  const router = useRouter();
  const prevDate = shiftDateSp(data.date, -1);
  const nextDate = shiftDateSp(data.date, 1);
  const dateLabel = formatDateLabelSp(data.date);
  const staffCols = Math.max(data.staff.length, 1);

  const [formMode, setFormMode] = useState<AgendaFormMode | null>(null);
  const [slot, setSlot] = useState<{
    date: string;
    staffId: string;
    hour: number;
    minute?: number;
  } | null>(null);
  const [detail, setDetail] = useState<AgendaAppointment | null>(null);
  const [editAppt, setEditAppt] = useState<AgendaAppointment | null>(null);
  const [recorrencia, setRecorrencia] = useState<AgendaAppointment | null>(null);
  const [ctx, setCtx] = useState<AgendaCtxTarget | null>(null);
  const isToday = data.date === todaySp();
  const now = useAgendaNow(isToday);
  const nowSlotLabel = now
    ? `${String(now.hour).padStart(2, "0")}:${now.minute >= 30 ? "30" : "00"}`
    : null;
  const nowHourLabel =
    nowSlotLabel && data.hours.includes(nowSlotLabel) ? nowSlotLabel : null;
  const nowPct = now
    ? Math.min(95, Math.max(2, ((now.minute % 30) / 30) * 100))
    : 0;
  const nowLabel = now
    ? `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`
    : "";

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
    const comanda = extra && "comanda" in extra ? extra.comanda : selectedOrder?.id;
    if (comanda) sp.set("comanda", comanda);
    return `/agenda?${sp.toString()}`;
  }

  function openComanda(orderId: string) {
    router.push(qs({ comanda: orderId }));
  }

  function closeComanda() {
    const sp = new URLSearchParams();
    sp.set("date", data.date);
    if (staffFilter) sp.set("staff", staffFilter);
    if (tabletMode) sp.set("modo", "tablet");
    router.push(`/agenda?${sp.toString()}`);
    router.refresh();
  }

  function staffHref(id?: string) {
    return qs({ staff: id });
  }

  function openSlot(staffId: string, hour: number, mode: AgendaFormMode, minute = 0) {
    setSlot({ date: data.date, staffId, hour, minute });
    setFormMode(mode);
  }

  function openEncaixe() {
    const first = data.staff[0];
    if (!first) return;
    const gridSlots = data.hours.map(parseSlotLabel).filter((s) => Number.isFinite(s.hour));
    let pick = gridSlots[0] ?? { hour: 9, minute: 0 };
    if (data.date === todaySp() && gridSlots.length && now) {
      const nowMin = now.hour * 60 + now.minute;
      pick =
        gridSlots.find((s) => s.hour * 60 + s.minute >= nowMin) ??
        gridSlots[gridSlots.length - 1]!;
    }
    openSlot(first.id, pick.hour, "encaixe", pick.minute);
  }

  async function openVenda(a: AgendaAppointment) {
    if (a.orderId) {
      openComanda(a.orderId);
      return;
    }
    const result = await openOrderFromAppointmentAction(a.id, a.clientId ?? undefined);
    if (result.ok) {
      refresh();
      openComanda(result.id);
    }
  }

  return (
    <>
      <PageHeader
        title={tabletMode ? "Agenda · Mesa" : "Agenda"}
        subtitle={`${dateLabel} · ${data.totalAppointments} agendamento(s)`}
        actions={
          <>
            <Link href="/pwa/consumo" className="btn btn-primary">
              Venda / Consumo
            </Link>
            <Link
              href={tabletMode ? qs({ modo: undefined }) : qs({ modo: "tablet" })}
              className="btn btn-outline"
            >
              {tabletMode ? "Modo normal" : "Modo tablet"}
            </Link>
            <Link href={qs({ date: todaySp() })} className="btn btn-outline">
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
          <Link href={staffHref()} className={`chip${!staffFilter ? " is-on" : ""}`}>
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
                  <div
                    className={`agenda-time${nowHourLabel === hour ? " is-now" : ""}`}
                  >
                    {hour}
                    {nowHourLabel === hour ? (
                      <span
                        className="agenda-now-line"
                        style={{ top: `${nowPct}%` }}
                        aria-hidden
                      >
                        <span className="agenda-now-badge">{nowLabel}</span>
                      </span>
                    ) : null}
                  </div>
                  {data.staff.map((s) => {
                    const { hour: hourNum, minute } = parseSlotLabel(hour);
                    const slots = slotsForLabel(data.appointments, s.id, hour);
                    const busy = slotBusy(
                      data.appointments,
                      s.id,
                      data.date,
                      hourNum,
                      minute
                    );
                    const showNow = nowHourLabel === hour;

                    return (
                      <div
                        key={`${s.id}-${hour}`}
                        className={`agenda-cell${permissions.canWrite ? " is-clickable" : ""}${showNow ? " is-now" : ""}${busy && slots.length === 0 ? " is-covered" : ""}`}
                        onClick={() => {
                          if (!permissions.canWrite) return;
                          if (!busy) openSlot(s.id, hourNum, "schedule", minute);
                        }}
                        onContextMenu={(e) => {
                          if (!permissions.canWrite) return;
                          e.preventDefault();
                          if (busy) return;
                          setCtx({
                            kind: "cell",
                            staffId: s.id,
                            hour: hourNum,
                            minute,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
                        title={
                          permissions.canWrite
                            ? busy
                              ? slots.length
                                ? "Botão direito no horário: ações rápidas"
                                : "Horário ocupado por atendimento em andamento"
                              : "Clique: agendar · Botão direito: menu"
                            : undefined
                        }
                      >
                        {showNow ? (
                          <span
                            className="agenda-now-line"
                            style={{ top: `${nowPct}%` }}
                            aria-hidden
                          />
                        ) : null}
                        {slots.map((a) => (
                          <div
                            key={a.id}
                            className={slotClass(a)}
                            style={{
                              ...slotSpanStyle(a),
                              ...(s.color && a.status !== "blocked"
                                ? { background: s.color }
                                : {}),
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetail(a);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCtx({
                                kind: "appointment",
                                appointment: a,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }}
                            title={`${formatTimeSp(a.startsAt)} – ${formatTimeSp(a.endsAt)} · botão direito: ações`}
                          >
                            <span className="slot-main">
                              {a.status !== "blocked" ? (
                                <PersonAvatar
                                  name={a.clientName}
                                  src={a.clientAvatarUrl}
                                  size={18}
                                />
                              ) : null}
                              <span>
                                <strong>{shortPersonName(a.clientName)}</strong>
                                {a.isEncaixe ? " · encaixe" : null}
                                {a.noPreference ? " · sem pref." : null}
                                {a.status === "arrived" ? " · no local" : null}
                                {a.tags?.[0] ? ` · #${a.tags[0]}` : null}
                                <br />
                                {a.serviceName ?? (a.status === "blocked" ? "Bloqueio" : "—")}
                              </span>
                            </span>
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
              <i style={{ background: "#16a34a" }} /> Confirmado
            </span>
            <span>
              <i style={{ background: "var(--slot-block)" }} /> Bloqueio
            </span>
            <span>
              <i style={{ background: "#9ca3af" }} /> Cancelado / ausente
            </span>
            {permissions.canWrite ? (
              <span className="legend-hint">
                Clique: detalhes · Direito: menu (comanda, no local, ausente…)
              </span>
            ) : null}
          </div>
        </section>

        {!tabletMode ? (
          <AgendaAside
            data={data}
            hrefForDate={(date) => qs({ date })}
            onOpenAppointment={setDetail}
            canWrite={permissions.canWrite}
            onBookSlot={(staffId, hour, minute) =>
              openSlot(staffId, hour, "schedule", minute ?? 0)
            }
          />
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
            <div className="agenda-aside-actions" style={{ marginTop: 8 }}>
              <Link href="/lista-espera" className="agenda-aside-btn is-primary">
                Lista de Espera
                {data.waitlistCount > 0 ? (
                  <span className="agenda-aside-btn-count is-on-primary">
                    {data.waitlistCount}
                  </span>
                ) : null}
              </Link>
            </div>
          </aside>
        )}
      </div>

      {!tabletMode ? (
        <AgendaQuickThinkWidget
          data={data}
          canWrite={permissions.canWrite}
          onBookSlot={(staffId, hour, minute) =>
            openSlot(staffId, hour, "schedule", minute ?? 0)
          }
        />
      ) : null}

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
          onOpenComanda={openComanda}
          onVenda={openVenda}
          onContaRecorrencia={(a) => {
            setDetail(null);
            setRecorrencia(a);
          }}
          onEdit={(a) => {
            setDetail(null);
            setEditAppt(a);
          }}
        />
      ) : null}

      {recorrencia ? (
        <ContaRecorrenciaModal
          open
          appointmentId={recorrencia.id}
          clientName={recorrencia.clientName}
          serviceName={recorrencia.serviceName}
          onClose={() => setRecorrencia(null)}
          onApplied={(orderId) => {
            setRecorrencia(null);
            refresh();
            openComanda(orderId);
          }}
        />
      ) : null}

      {editAppt ? (
        <AgendaEditModal
          open
          appointment={editAppt}
          staff={data.staff}
          services={services}
          onClose={() => setEditAppt(null)}
          onSaved={() => {
            setEditAppt(null);
            refresh();
          }}
        />
      ) : null}

      <AgendaContextMenu
        target={ctx}
        date={data.date}
        permissions={permissions}
        onClose={() => setCtx(null)}
        onSaved={refresh}
        onOpenComanda={openComanda}
        onOpenForm={(mode, staffId, hour, minute) =>
          openSlot(staffId, hour, mode, minute ?? 0)
        }
        onOpenDetail={(appt) => setDetail(appt)}
        onVenda={openVenda}
        onContaRecorrencia={(a) => {
          setCtx(null);
          setRecorrencia(a);
        }}
      />

      {selectedOrder && orderCatalog && orderPermissions ? (
        <OrderDrawer
          open
          order={selectedOrder}
          services={orderCatalog.services}
          products={orderCatalog.products}
          packages={orderCatalog.packages}
          staff={orderCatalog.staff}
          permissions={orderPermissions}
          onClose={closeComanda}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}
