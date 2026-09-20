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
import { previewStyle, useAgendaDrag } from "@/components/agenda/useAgendaDrag";
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
import { formatPhone, formatMoney, labelApptStatus } from "@/lib/format";

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

function slotDurationMin(a: AgendaAppointment): number {
  return Math.max(5, Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000));
}

function slotPhoneLabel(a: AgendaAppointment): string | null {
  if (!a.clientPhone) return null;
  const label = formatPhone(a.clientPhone);
  return label === "—" ? null : label;
}

function slotStatusGlyph(status: string): { glyph: string; title: string } | null {
  switch (status) {
    case "confirmed":
      return { glyph: "✓", title: labelApptStatus(status) };
    case "arrived":
      return { glyph: "●", title: labelApptStatus(status) };
    case "in_progress":
      return { glyph: "▶", title: labelApptStatus(status) };
    case "completed":
      return { glyph: "✔", title: labelApptStatus(status) };
    case "no_show":
    case "cancelled":
      return { glyph: "✕", title: labelApptStatus(status) };
    default:
      return null;
  }
}

function slotClass(a: AgendaAppointment): string {
  const parts = ["slot"];
  if (a.status === "blocked") parts.push("block");
  else if (a.status === "cancelled") parts.push("muted");
  else if (a.status === "no_show" || (a.seriesConflict && a.status === "scheduled")) parts.push("tone-noshow");
  else if (a.orderStatus === "closed") parts.push("tone-paid");
  else if (a.status === "confirmed") parts.push("tone-confirmed");
  else if (a.noPreference) parts.push("tone-nopref");
  else parts.push("tone-open");
  if (a.status === "arrived" || a.status === "in_progress") parts.push("active");
  else if (a.isEncaixe) parts.push("encaixe");
  if (slotDurationMin(a) >= 40) parts.push("is-tall");
  if (a.orderId) parts.push("has-order");
  const badgeCount =
    (slotStatusGlyph(a.status) ? 1 : 0) +
    (a.orderId && a.status !== "blocked" ? 1 : 0) +
    (a.status !== "blocked" &&
    a.clientAccountBalanceCents != null &&
    a.clientAccountBalanceCents !== 0
      ? 1
      : 0);
  if (badgeCount >= 2) parts.push("has-badges-2");
  else if (badgeCount === 1) parts.push("has-badges-1");
  if (badgeCount >= 3) parts.push("has-badges-3");
  return parts.join(" ");
}

/** Altura/topo do card na grade de 30 min (célula ~40px). */
function slotSpanStyle(a: AgendaAppointment): React.CSSProperties {
  const durationMin = slotDurationMin(a);
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
  const drag = useAgendaDrag({
    date: data.date,
    canWrite: permissions.canWrite,
    onDone: () => router.refresh(),
  });
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
              Venda (celular)
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
                        className={`agenda-cell${permissions.canWrite ? " is-clickable" : ""}${showNow ? " is-now" : ""}${busy && slots.length === 0 ? " is-covered" : ""}${
                          drag.preview?.mode === "move" &&
                          drag.preview.staffId === s.id &&
                          drag.preview.hour === hourNum &&
                          drag.preview.minute === minute
                            ? " is-drop-target"
                            : ""
                        }`}
                        data-agenda-cell=""
                        data-staff-id={s.id}
                        data-hour={hourNum}
                        data-minute={minute}
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
                                ? "Arraste o horário · Botão direito: ações"
                                : "Horário ocupado por atendimento em andamento"
                              : "Clique: agendar · Arraste um horário para cá · Botão direito: menu"
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
                        {slots.map((a) => {
                          const phone = slotPhoneLabel(a);
                          const statusGlyph = slotStatusGlyph(a.status);
                          const tall = slotDurationMin(a) >= 40;
                          const statusHint = statusGlyph?.title;
                          const accountHint =
                            a.clientAccountBalanceCents != null && a.clientAccountBalanceCents !== 0
                              ? a.clientAccountBalanceCents < 0
                                ? `fiado ${formatMoney(a.clientAccountBalanceCents)}`
                                : `crédito ${formatMoney(a.clientAccountBalanceCents)}`
                              : null;
                          const titleParts = [
                            `${formatTimeSp(a.startsAt)} – ${formatTimeSp(a.endsAt)}`,
                            phone,
                            statusHint,
                            accountHint,
                            a.clientHairPreference ? `corte: ${a.clientHairPreference}` : null,
                            a.orderId ? "comanda vinculada" : null,
                            "arraste para outro profissional/horário · puxe a borda para duração",
                            "botão direito: ações",
                          ].filter(Boolean);
                          return (
                          <div
                            key={a.id}
                            className={`${slotClass(a)}${drag.preview?.id === a.id ? " is-dragging" : ""}`}
                            style={{
                              ...slotSpanStyle(a),
                              ...previewStyle(drag.preview, a.id),
                              ...(s.color && a.status !== "blocked"
                                ? { background: s.color }
                                : {}),
                            }}
                            onPointerDown={(e) => {
                              if (!permissions.canWrite) return;
                              drag.beginMove(a, e);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (drag.didDrag()) return;
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
                            title={titleParts.join(" · ")}
                          >
                            {a.status !== "blocked" ? (
                              <span className="slot-badges" aria-hidden>
                                {statusGlyph ? (
                                  <span className="slot-badge">{statusGlyph.glyph}</span>
                                ) : null}
                                {a.orderId ? (
                                  <span className="slot-badge slot-badge-order">⌗</span>
                                ) : null}
                                {a.clientAccountBalanceCents != null &&
                                a.clientAccountBalanceCents < 0 ? (
                                  <span className="slot-badge slot-badge-debt" title="Fiado">
                                    −
                                  </span>
                                ) : a.clientAccountBalanceCents != null &&
                                  a.clientAccountBalanceCents > 0 ? (
                                  <span className="slot-badge slot-badge-credit" title="Crédito">
                                    +
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                            <span className="slot-main">
                              {a.status !== "blocked" ? (
                                <PersonAvatar
                                  name={a.clientName}
                                  src={a.clientAvatarUrl}
                                  size={18}
                                />
                              ) : null}
                              <span className="slot-copy">
                                <strong>{shortPersonName(a.clientName)}</strong>
                                {a.isEncaixe ? " · encaixe" : null}
                                {a.noPreference ? " · sem pref." : null}
                                {a.seriesConflict ? ` · ${a.seriesConflict}` : null}
                                {a.status === "arrived" ? " · no local" : null}
                                {a.status === "in_progress" ? " · em atend." : null}
                                {a.clientHairPreference && tall
                                  ? ` · ${a.clientHairPreference}`
                                  : null}
                                {a.tags?.[0] ? ` · #${a.tags[0]}` : null}
                                {tall && phone ? (
                                  <>
                                    <br />
                                    <span className="slot-phone">{phone}</span>
                                  </>
                                ) : null}
                                <br />
                                <span className="slot-service">
                                  {a.serviceName ?? (a.status === "blocked" ? "Bloqueio" : "—")}
                                </span>
                              </span>
                            </span>
                            {permissions.canWrite &&
                            a.status !== "blocked" &&
                            !["cancelled", "completed", "no_show"].includes(a.status) ? (
                              <button
                                type="button"
                                className="slot-resize"
                                aria-label="Puxar duração"
                                title="Puxe para mudar a duração"
                                onPointerDown={(e) => drag.beginResize(a, e)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : null}
                          </div>
                          );
                        })}
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
              <i style={{ background: "#16a34a" }} /> Confirmado ✓
            </span>
            <span>
              <span className="legend-glyph" aria-hidden>
                ●
              </span>{" "}
              No local
            </span>
            <span>
              <span className="legend-glyph" aria-hidden>
                ▶
              </span>{" "}
              Em atendimento
            </span>
            <span>
              <span className="legend-glyph" aria-hidden>
                ⌗
              </span>{" "}
              Comanda
            </span>
            <span>
              <i style={{ background: "var(--slot-block)" }} /> Bloqueio
            </span>
            <span>
              <i style={{ background: "#9ca3af" }} /> Cancelado / ausente ✕
            </span>
            {permissions.canWrite ? (
              <span className="legend-hint">
                Arraste: muda profissional/horário · Puxe a borda: duração · Clique: detalhes · Direito: menu
              </span>
            ) : null}
          </div>
          {drag.error ? (
            <p className="agenda-drag-error" role="alert">
              {drag.error}{" "}
              <button type="button" className="btn btn-outline btn-sm" onClick={drag.clearError}>
                Ok
              </button>
            </p>
          ) : null}
          {drag.pending ? <p className="agenda-drag-pending muted">Salvando horário…</p> : null}
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
          onOpenDate={(date) => {
            setFormMode(null);
            setSlot(null);
            router.push(qs({ date }));
          }}
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
