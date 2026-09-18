"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  applyRecurrencePackageAction,
  listRecurrencePackagesAction,
} from "@/app/(painel)/comandas/actions";
import { formatDateSp } from "@/lib/datetime";

type Option = {
  clientPackageId: string;
  packageName: string;
  remainingQty: number;
  totalQty: number;
  expiresAt: string | null;
};

type Props = {
  open: boolean;
  appointmentId: string;
  clientName: string | null;
  serviceName: string | null;
  onClose: () => void;
  onApplied: (orderId: string) => void;
};

export function ContaRecorrenciaModal({
  open,
  appointmentId,
  clientName,
  serviceName,
  onClose,
  onApplied,
}: Props) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState("");
  const [resolvedService, setResolvedService] = useState(serviceName);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelected("");
    listRecurrencePackagesAction(appointmentId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          setOptions([]);
          return;
        }
        setOptions(res.options);
        setResolvedService(res.serviceName ?? serviceName);
        if (res.options.length === 1) {
          setSelected(res.options[0].clientPackageId);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Falha ao carregar pacotes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, appointmentId, serviceName]);

  function handleSave() {
    if (!selected) {
      setError("Selecione um pacote");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await applyRecurrencePackageAction(appointmentId, selected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast(
        "Detalhes do pacote inseridos na comanda. Comissão no preço de tabela.",
        "success"
      );
      onApplied(result.id);
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Conta Recorrência"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={pending || loading || !selected || options.length === 0}
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}

      <p className="client-profile-hint" style={{ marginTop: 0 }}>
        {clientName ? <strong>{clientName}</strong> : "Cliente"} · serviço{" "}
        {resolvedService ?? "—"}
      </p>

      <label className="field">
        <span>Selecione um pacote</span>
        {loading ? (
          <p className="muted">Carregando créditos…</p>
        ) : options.length === 0 ? (
          <p className="muted">Nenhum crédito ativo cobre este serviço.</p>
        ) : (
          <select
            className="input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending}
          >
            <option value="">— escolher —</option>
            {options.map((o) => (
              <option key={o.clientPackageId} value={o.clientPackageId}>
                {o.packageName} · {o.remainingQty} rest. de {o.totalQty}
                {o.expiresAt
                  ? ` · exp. ${formatDateSp(new Date(o.expiresAt))}`
                  : ""}
              </option>
            ))}
          </select>
        )}
      </label>

      <p className="client-profile-hint muted" style={{ marginBottom: 0 }}>
        A comissão do profissional é calculada no preço de tabela do serviço, mesmo com
        abate do pacote (paridade AppBarber).
      </p>
    </Modal>
  );
}
