"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { dragAppointmentAction } from "@/app/(painel)/agenda/actions";
import { hourInSp, minuteInSp } from "@/lib/datetime";
import type { AgendaAppointment } from "@/server/agenda/types";

const CELL_PX = 40;
const MIN_PER_CELL = 30;
const SNAP_MIN = 5;
const DRAG_THRESHOLD_PX = 6;

export type AgendaDragPreview = {
  id: string;
  mode: "move" | "resize";
  staffId: string;
  hour: number;
  minute: number;
  durationMin: number;
};

type DragSession = {
  id: string;
  mode: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  staffId: string;
  hour: number;
  minute: number;
  durationMin: number;
};

function snapMinutes(raw: number): number {
  return Math.max(5, Math.round(raw / SNAP_MIN) * SNAP_MIN);
}

function clampMinute(m: number): number {
  const snapped = Math.round(m / SNAP_MIN) * SNAP_MIN;
  return Math.min(55, Math.max(0, snapped));
}

function hitCell(clientX: number, clientY: number): { staffId: string; hour: number; minute: number } | null {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest?.("[data-agenda-cell]") as HTMLElement | null;
  if (!cell) return null;
  const staffId = cell.dataset.staffId;
  const hour = Number(cell.dataset.hour);
  const minute = Number(cell.dataset.minute);
  if (!staffId || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { staffId, hour, minute };
}

export function useAgendaDrag(opts: {
  date: string;
  canWrite: boolean;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<AgendaDragPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sessionRef = useRef<DragSession | null>(null);
  const previewRef = useRef<AgendaDragPreview | null>(null);
  const justDraggedRef = useRef(false);
  const dateRef = useRef(opts.date);
  const onDoneRef = useRef(opts.onDone);
  dateRef.current = opts.date;
  onDoneRef.current = opts.onDone;

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      s.moved = true;
      justDraggedRef.current = true;

      if (s.mode === "resize") {
        const deltaMin = (dy / CELL_PX) * MIN_PER_CELL;
        const durationMin = snapMinutes(s.durationMin + deltaMin);
        setPreview({
          id: s.id,
          mode: "resize",
          staffId: s.staffId,
          hour: s.hour,
          minute: s.minute,
          durationMin,
        });
        return;
      }

      const hit = hitCell(e.clientX, e.clientY);
      if (!hit) return;
      setPreview({
        id: s.id,
        mode: "move",
        staffId: hit.staffId,
        hour: hit.hour,
        minute: clampMinute(hit.minute),
        durationMin: s.durationMin,
      });
    }

    function onUp(e: PointerEvent) {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      sessionRef.current = null;
      const final = previewRef.current;
      setPreview(null);

      if (!s.moved || !final) {
        window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
        return;
      }

      const changed =
        final.staffId !== s.staffId ||
        final.hour !== s.hour ||
        final.minute !== s.minute ||
        final.durationMin !== s.durationMin;
      if (!changed) {
        window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
        return;
      }

      setError(null);
      startTransition(async () => {
        const result = await dragAppointmentAction({
          id: final.id,
          date: dateRef.current,
          staffId: final.staffId,
          hour: final.hour,
          minute: final.minute,
          durationMin: final.durationMin,
        });
        window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
        if (!result.ok) {
          setError(result.error ?? "Não foi possível mover");
          return;
        }
        onDoneRef.current();
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function beginMove(a: AgendaAppointment, e: React.PointerEvent) {
    if (!opts.canWrite) return;
    if (e.button !== 0) return;
    if (["cancelled", "completed", "no_show", "blocked"].includes(a.status)) return;
    if (!a.staffId) return;
    e.preventDefault();
    e.stopPropagation();
    const durationMin = Math.max(
      5,
      Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000)
    );
    justDraggedRef.current = false;
    sessionRef.current = {
      id: a.id,
      mode: "move",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      staffId: a.staffId,
      hour: hourInSp(a.startsAt),
      minute: minuteInSp(a.startsAt),
      durationMin,
    };
    setError(null);
  }

  function beginResize(a: AgendaAppointment, e: React.PointerEvent) {
    if (!opts.canWrite) return;
    if (e.button !== 0) return;
    if (["cancelled", "completed", "no_show", "blocked"].includes(a.status)) return;
    if (!a.staffId) return;
    e.preventDefault();
    e.stopPropagation();
    const durationMin = Math.max(
      5,
      Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000)
    );
    justDraggedRef.current = false;
    sessionRef.current = {
      id: a.id,
      mode: "resize",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      staffId: a.staffId,
      hour: hourInSp(a.startsAt),
      minute: minuteInSp(a.startsAt),
      durationMin,
    };
    setPreview({
      id: a.id,
      mode: "resize",
      staffId: a.staffId,
      hour: hourInSp(a.startsAt),
      minute: minuteInSp(a.startsAt),
      durationMin,
    });
    setError(null);
  }

  function didDrag(): boolean {
    return justDraggedRef.current;
  }

  function clearError() {
    setError(null);
  }

  return {
    preview,
    error,
    pending,
    beginMove,
    beginResize,
    didDrag,
    clearError,
  };
}

export function previewStyle(
  preview: AgendaDragPreview | null,
  appointmentId: string
): React.CSSProperties | undefined {
  if (!preview || preview.id !== appointmentId) return undefined;
  if (preview.mode !== "resize") return undefined;
  const offsetMin = preview.minute % 30;
  const span = preview.durationMin / 30;
  return {
    top: `calc(${(offsetMin / 30) * 100}% + 1px)`,
    height: `calc(${span * 100}% - 2px)`,
    opacity: 0.92,
    outline: "2px solid #0f766e",
  };
}
