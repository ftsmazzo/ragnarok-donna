"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/cadastro/PersonAvatar";
import type { AgendaAppointment, AgendaPermissions } from "@/server/agenda/types";
import type { ClientUpsellTip } from "@/server/insights/types";
import { formatDateTimeSp, formatTimeSp } from "@/lib/datetime";
import { formatMoney, formatPhone, labelApptStatus } from "@/lib/format";
import {
  patchAppointmentMetaAction,
  payAndCloseFromAgendaAction,
  removeBlockAction,
  setAppointmentEncaixeAction,
  updateAppointmentStatusAction,
} from "@/app/(painel)/agenda/actions";
import { openOrderFromAppointmentAction } from "@/app/(painel)/comandas/actions";
import { getClientUpsellTipsAction } from "@/app/(painel)/agenda/insights-actions";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";

type Props = {
  open: boolean;
  appointment: AgendaAppointment;
  date: string;
  permissions: AgendaPermissions;
  onClose: () => void;
  onSaved: () => void;
  onOpenComanda?: (orderId: string) => void;
  onVenda?: (a: AgendaAppointment) => void;
  onEdit?: (a: AgendaAppointment) => void;
  onContaRecorrencia?: (a: AgendaAppointment) => void;
};

const PAY_METHODS = PAYMENT_METHOD_OPTIONS.filter((o) => o.value !== "client_account");

export function AgendaDetailModal({
  open,
  appointment: a,
  date,
  permissions,
  onClose,
  onSaved,
  onOpenComanda,
  onVenda,
  onEdit,
  onContaRecorrencia,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [tips, setTips] = useState<ClientUpsellTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [tagValue, setTagValue] = useState("");
  const [payMethod, setPayMethod] = useState("pix");
  const isBlock = a.status === "blocked";
  const closed = a.status === "cancelled" || a.status === "completed" || a.status === "no_show";

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

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("");
    startTransition(async () => {
      const result = await fn();
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
      onOpenComanda?.(a.orderId);
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
      if (onOpenComanda) onOpenComanda(result.id);
      else router.push(`/comandas?id=${result.id}`);
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
          {!isBlock && permissions.canOpenOrder && !closed ? (
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
              onClick={() => run(() => removeBlockAction(a.id, date))}
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
              <dd className="agenda-client-dd">
                <PersonAvatar name={a.clientName} src={a.clientAvatarUrl} size={32} />
                <span>
                  {a.clientName}
                  {a.clientPhone && formatPhone(a.clientPhone) !== "—" ? (
                    <>
                      <br />
                      <span className="muted">{formatPhone(a.clientPhone)}</span>
                    </>
                  ) : null}
                  {a.clientAccountBalanceCents != null && a.clientAccountBalanceCents !== 0 ? (
                    <>
                      <br />
                      <span
                        className={
                          a.clientAccountBalanceCents < 0
                            ? "agenda-account is-debt"
                            : "agenda-account is-credit"
                        }
                      >
                        Conta: {formatMoney(a.clientAccountBalanceCents)}
                        {a.clientAccountBalanceCents < 0 ? " (fiado)" : " (crédito)"}
                      </span>
                    </>
                  ) : a.clientAccountBalanceCents === 0 ? (
                    <>
                      <br />
                      <span className="muted">Conta: em dia</span>
                    </>
                  ) : null}
                  {a.clientHairPreference ? (
                    <>
                      <br />
                      <span className="agenda-hair-pref">
                        Corte: {a.clientHairPreference}
                      </span>
                    </>
                  ) : null}
                </span>
              </dd>
            </div>
            <div>
              <dt>Serviço</dt>
              <dd>{a.serviceName ?? "—"}</dd>
            </div>
            {a.staffName || a.staffId ? (
              <div>
                <dt>Profissional</dt>
                <dd>{a.staffName ?? "—"}</dd>
              </div>
            ) : null}
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
            {a.seriesConflict ? (
              <div>
                <dt>Série</dt>
                <dd>Não coube na jornada ({a.seriesConflict}). Ajuste o horário ou o profissional.</dd>
              </div>
            ) : null}
            {a.noPreference ? (
              <div>
                <dt>Preferência</dt>
                <dd>Sem preferência de profissional</dd>
              </div>
            ) : null}
            {a.seriesUpcoming && a.seriesUpcoming.length > 0 ? (
              <div>
                <dt>Agenda recorrente</dt>
                <dd>
                  <ul className="series-result">
                    {a.seriesUpcoming.map((s) => (
                      <li key={s.id} className={s.status === "no_show" || s.status === "cancelled" ? "bad" : "ok"}>
                        {formatDateTimeSp(new Date(s.startsAt))} · {labelApptStatus(s.status)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            {a.tags?.length ? (
              <div>
                <dt>Tags</dt>
                <dd>{a.tags.join(" · ")}</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {a.notes ? (
          <div>
            <dt>{isBlock ? "Motivo" : "Obs."}</dt>
            <dd>{a.notes}</dd>
          </div>
        ) : null}
        {isBlock && a.blockedByName ? (
          <div>
            <dt>Bloqueado por</dt>
            <dd>{a.blockedByName}</dd>
          </div>
        ) : null}
        <div>
          <dt>Criado</dt>
          <dd>{formatDateTimeSp(a.startsAt)}</dd>
        </div>
      </dl>

      {!isBlock && !closed ? (
        <div className="agenda-status-actions">
          <p className="client-profile-hint">Ações rápidas (mesmo menu do botão direito)</p>
          <div className="agenda-status-buttons">
            {permissions.canWrite && !isBlock && !closed ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={() => onEdit?.(a)}
              >
                Editar
              </button>
            ) : null}

            {permissions.canOpenOrder ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={handleOpenOrder}
              >
                Abrir Comanda
              </button>
            ) : null}

            {permissions.canOpenOrder && a.clientId && a.serviceId ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={() => onContaRecorrencia?.(a)}
              >
                Conta Recorrência
              </button>
            ) : null}

            {permissions.canUpdateStatus && a.status !== "arrived" ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={() => run(() => updateAppointmentStatusAction(a.id, "arrived", date))}
              >
                No Local
              </button>
            ) : null}

            {permissions.canUpdateStatus && a.status === "scheduled" ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={() => run(() => updateAppointmentStatusAction(a.id, "confirmed", date))}
              >
                Confirmar
              </button>
            ) : null}

            {permissions.canUpdateStatus && a.status === "confirmed" ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={() => run(() => updateAppointmentStatusAction(a.id, "scheduled", date))}
              >
                Desconfirmar
              </button>
            ) : null}

            {permissions.canUpdateStatus ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={pending || a.status === "in_progress"}
                  onClick={() =>
                    run(() => updateAppointmentStatusAction(a.id, "in_progress", date))
                  }
                >
                  Em atendimento
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={pending || a.status === "completed"}
                  onClick={() =>
                    run(() => updateAppointmentStatusAction(a.id, "completed", date))
                  }
                >
                  Finalizar horário
                </button>
              </>
            ) : null}

            {permissions.canWrite ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    patchAppointmentMetaAction(a.id, date, {
                      noPreference: !a.noPreference,
                    })
                  )
                }
              >
                {a.noPreference ? "Com preferência" : "Sem Preferência"}
              </button>
            ) : null}

            {permissions.canWrite ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={() =>
                  run(() => setAppointmentEncaixeAction(a.id, !a.isEncaixe, date))
                }
              >
                {a.isEncaixe ? "Tirar encaixe" : "Encaixe"}
              </button>
            ) : null}

            {permissions.canOpenOrder ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending}
                onClick={() => {
                  onVenda?.(a);
                  onClose();
                }}
              >
                Venda
              </button>
            ) : null}

            {permissions.canCancel ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={pending}
                  onClick={() => run(() => updateAppointmentStatusAction(a.id, "no_show", date))}
                >
                  Ausente
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => updateAppointmentStatusAction(a.id, "cancelled", date))
                  }
                >
                  Cancelado
                </button>
              </>
            ) : null}
          </div>

          {permissions.canWrite ? (
            <div className="agenda-tag-row">
              <input
                className="input"
                value={tagValue}
                placeholder="Adicionar tag…"
                maxLength={40}
                onChange={(e) => setTagValue(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pending || !tagValue.trim()}
                onClick={() => {
                  const t = tagValue.trim();
                  if (!t) return;
                  run(() => patchAppointmentMetaAction(a.id, date, { addTag: t }));
                }}
              >
                Adicionar Tag
              </button>
            </div>
          ) : null}

          {permissions.canOpenOrder && a.orderId ? (
            <div className="agenda-pay-row">
              <label className="form-field" style={{ margin: 0, flex: 1 }}>
                <span>Finalizar Comanda</span>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  disabled={pending}
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={() =>
                  run(() => payAndCloseFromAgendaAction(a.orderId!, payMethod, date))
                }
              >
                Pagar e fechar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
