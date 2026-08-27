"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import type { AgendaAppointment, AgendaPermissions } from "@/server/agenda/types";
import type { ClientUpsellTip } from "@/server/insights/types";
import { formatDateTimeSp, formatTimeSp } from "@/lib/datetime";
import { formatMoney, labelApptStatus } from "@/lib/format";
import {
  removeBlockAction,
  updateAppointmentStatusAction,
} from "@/app/(painel)/agenda/actions";
import { openOrderFromAppointmentAction } from "@/app/(painel)/comandas/actions";
import { getClientUpsellTipsAction } from "@/app/(painel)/agenda/insights-actions";

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
  const [tips, setTips] = useState<ClientUpsellTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const isBlock = a.status === "blocked";

  useEffect(() => {
    if (!open || isBlock || !a.clientId) {
      setTips([]);
      return;
    }
    let cancelled = false;
    setTipsLoading(true);
    getClientUpsellTipsAction(a.clientId)
      .then((rows) => {
        if (!cancelled) setTips(rows);
      })
      .catch(() => {
        if (!cancelled) setTips([]);
      })
      .finally(() => {
        if (!cancelled) setTipsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isBlock, a.clientId, a.id]);

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
      size="lg"
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

      {!isBlock && a.clientId ? (
        <div className="upsell-panel">
          <h3 className="client-profile-heading">Sugestões para o cliente</h3>
          {tipsLoading ? (
            <p className="client-profile-hint">Carregando histórico…</p>
          ) : tips.length === 0 ? (
            <p className="client-profile-hint muted">
              Sem alerta de recompra no momento — mantenha o atendimento de sempre.
            </p>
          ) : (
            <ul className="upsell-list">
              {tips.map((t) => (
                <li key={`${t.kind}-${t.catalogId ?? t.catalogName}`}>
                  <strong>{t.title}</strong>
                  <span>{t.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

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

      {!isBlock &&
      permissions.canUpdateStatus &&
      a.status !== "cancelled" &&
      a.status !== "completed" ? (
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
