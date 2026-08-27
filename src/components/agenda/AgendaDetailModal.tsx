"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import type { AgendaAppointment, AgendaPermissions } from "@/server/agenda/types";
import { formatDateTimeSp, formatTimeSp } from "@/lib/datetime";
import { formatMoney, labelApptStatus } from "@/lib/format";
import {
  removeBlockAction,
  updateAppointmentStatusAction,
} from "@/app/(painel)/agenda/actions";
import { openOrderFromAppointmentAction } from "@/app/(painel)/comandas/actions";

type Props = {
  open: boolean;
  appointment: AgendaAppointment;
  date: string;
  permissions: AgendaPermissions;
  onClose: () => void;
  onSaved: () => void;
};

const STATUS_FLOW = [
  { value: "confirmed", label: "Confirmar" },
  { value: "arrived", label: "Chegou" },
  { value: "in_progress", label: "Em atendimento" },
  { value: "completed", label: "Finalizar" },
];

export function AgendaDetailModal({
  open,
  appointment: a,
  date,
  permissions,
  onClose,
  onSaved,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const isBlock = a.status === "blocked";

  function runStatus(status: string) {
    setError("");
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(a.id, status, date);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  function handleRemoveBlock() {
    setError("");
    startTransition(async () => {
      const result = await removeBlockAction(a.id, date);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  function handleOpenOrder() {
    setError("");
    if (a.orderId) {
      router.push(`/comandas?id=${a.orderId}`);
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await openOrderFromAppointmentAction(a.id, a.clientId ?? undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
      router.push(`/comandas?id=${result.id}`);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isBlock ? "Bloqueio" : "Agendamento"}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Fechar
          </button>
          {!isBlock && permissions.canOpenOrder && a.status !== "cancelled" ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenOrder}
              disabled={pending}
            >
              {a.orderId ? "Ver comanda" : "Abrir comanda"}
            </button>
          ) : null}
          {isBlock && permissions.canWrite ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleRemoveBlock}
              disabled={pending}
            >
              Remover bloqueio
            </button>
          ) : null}
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}

      <dl className="detail-dl">
        <div>
          <dt>Horário</dt>
          <dd>
            {formatTimeSp(a.startsAt)} – {formatTimeSp(a.endsAt)}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{labelApptStatus(a.status)}</dd>
        </div>
        {!isBlock ? (
          <>
            <div>
              <dt>Cliente</dt>
              <dd>{a.clientName}</dd>
            </div>
            <div>
              <dt>Serviço</dt>
              <dd>{a.serviceName ?? "—"}</dd>
            </div>
            {a.priceCents != null ? (
              <div>
                <dt>Valor</dt>
                <dd>{formatMoney(a.priceCents)}</dd>
              </div>
            ) : null}
            {a.isEncaixe ? (
              <div>
                <dt>Tipo</dt>
                <dd>Encaixe</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {a.notes ? (
          <div>
            <dt>Obs.</dt>
            <dd>{a.notes}</dd>
          </div>
        ) : null}
        <div>
          <dt>Criado</dt>
          <dd>{formatDateTimeSp(a.startsAt)}</dd>
        </div>
      </dl>

      {!isBlock && permissions.canUpdateStatus && a.status !== "cancelled" && a.status !== "completed" ? (
        <div className="agenda-status-actions">
          <p className="client-profile-hint">Atualizar status</p>
          <div className="agenda-status-buttons">
            {STATUS_FLOW.map((s) => (
              <button
                key={s.value}
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending || a.status === s.value}
                onClick={() => runStatus(s.value)}
              >
                {s.label}
              </button>
            ))}
            {permissions.canCancel ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={pending}
                  onClick={() => runStatus("no_show")}
                >
                  Ausente
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={pending}
                  onClick={() => runStatus("cancelled")}
                >
                  Cancelar
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
