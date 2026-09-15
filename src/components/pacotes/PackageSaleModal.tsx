"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { completePackageSaleAction } from "@/app/(painel)/pacotes/actions";
import { ClientPicker } from "@/components/agenda/ClientPicker";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { PaymentMethodSelect } from "@/lib/paymentMethods";

export type PackageSaleOption = {
  id: string;
  name: string;
  priceCents: number;
  itemLabel: string;
  expiresAfterDays: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  packages: PackageSaleOption[];
  initialClientId?: string;
  initialClientName?: string;
  onSuccess?: () => void;
};

function formatExpiration(days: number | null): string {
  if (days == null || days <= 0) return "Sem prazo definido";
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("pt-BR");
}

function parseReaisToCents(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function PackageSaleModal({
  open,
  onClose,
  packages,
  initialClientId,
  initialClientName,
  onSuccess,
}: Props) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [packageId, setPackageId] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("pix");
  const [amountReais, setAmountReais] = useState("");
  const [payAndClose, setPayAndClose] = useState(true);
  const [formError, setFormError] = useState("");

  const selected = useMemo(
    () => packages.find((p) => p.id === packageId) ?? null,
    [packages, packageId]
  );

  useEffect(() => {
    if (!open) return;
    setFormError("");
    setNotes("");
    setMethod("pix");
    setPayAndClose(true);
    setPackageId("");
    if (initialClientId) {
      setClientId(initialClientId);
      setClientLabel(initialClientName ?? "");
    } else {
      setClientId("");
      setClientLabel("");
    }
  }, [open, initialClientId, initialClientName]);

  useEffect(() => {
    if (selected) {
      setAmountReais((selected.priceCents / 100).toFixed(2));
    } else {
      setAmountReais("");
    }
  }, [selected]);

  function handleClose() {
    if (pending) return;
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!clientId) {
      setFormError("Selecione o cliente");
      return;
    }
    if (!packageId) {
      setFormError("Selecione o pacote");
      return;
    }
    const amountCents = parseReaisToCents(amountReais);
    if (payAndClose && amountCents == null) {
      setFormError("Informe o valor pago");
      return;
    }

    startTransition(async () => {
      const result = await completePackageSaleAction({
        clientId,
        packageId,
        notes: notes.trim() || undefined,
        method: payAndClose ? method : undefined,
        payAndClose,
        amountCents: payAndClose ? amountCents ?? undefined : undefined,
      });
      if (!result.ok) {
        const msg = result.error ?? "Não foi possível vender o pacote";
        setFormError(msg);
        showToast(msg, "error");
        return;
      }
      showToast("Pacote vendido com sucesso!", "success");
      onSuccess?.();
      onClose();
    });
  }

  const canSubmit = Boolean(clientId && packageId && !pending);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Venda de pacote"
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleClose}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="package-sale-form"
            className="btn btn-primary"
            disabled={!canSubmit}
          >
            {pending ? "Comprando…" : "Comprar"}
          </button>
        </>
      }
    >
      <form id="package-sale-form" className="package-sale-form" onSubmit={handleSubmit}>
        {formError ? <div className="form-error">{formError}</div> : null}

        {initialClientId && clientLabel ? (
          <p className="client-profile-hint">
            Cliente: <strong>{clientLabel}</strong>
          </p>
        ) : (
          <ClientPicker
            required
            value={clientId}
            onChange={(id, label) => {
              setClientId(id);
              setClientLabel(label);
            }}
          />
        )}

        <label className="form-field">
          <span>Pacote *</span>
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            required
          >
            <option value="">Selecione o pacote…</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatMoney(p.priceCents)}
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <div className="package-sale-preview">
            <table>
              <thead>
                <tr>
                  <th>Itens inclusos</th>
                  <th>Valor</th>
                  <th>Obs</th>
                  <th>Expiração</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{selected.itemLabel || "—"}</td>
                  <td>{formatMoney(selected.priceCents)}</td>
                  <td>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observações da venda…"
                      aria-label="Obs"
                    />
                  </td>
                  <td className="package-sale-expiry">
                    {formatExpiration(selected.expiresAfterDays)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="package-sale-pay-grid">
          <label className="form-field">
            <span>Forma de pagamento{payAndClose ? " *" : ""}</span>
            <PaymentMethodSelect
              value={method}
              onChange={setMethod}
              required={payAndClose}
            />
          </label>
          <label className="form-field">
            <span>Valor pago (R$){payAndClose ? " *" : ""}</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amountReais}
              onChange={(e) => setAmountReais(e.target.value)}
              required={payAndClose}
              disabled={!selected}
            />
          </label>
        </div>

        <label className="form-field package-sale-checkbox">
          <input
            type="checkbox"
            checked={payAndClose}
            onChange={(e) => setPayAndClose(e.target.checked)}
          />
          <span>Pagar e liberar carteira agora</span>
        </label>
      </form>
    </Modal>
  );
}
