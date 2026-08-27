"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { ClientPicker } from "@/components/agenda/ClientPicker";
import { openOrderAction } from "@/app/(painel)/comandas/actions";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
};

export function OpenOrderModal({ open, onClose, onCreated }: Props) {
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    if (clientId) formData.set("clientId", clientId);

    startTransition(async () => {
      const result = await openOrderAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setClientId("");
      onCreated(result.id);
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova comanda"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" form="open-order-form" className="btn btn-primary" disabled={pending}>
            {pending ? "Abrindo…" : "Abrir comanda"}
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <form id="open-order-form" className="form-stack" onSubmit={handleSubmit}>
        <ClientPicker value={clientId} onChange={(id) => setClientId(id)} />
        <input type="hidden" name="clientId" value={clientId} />
        <label className="form-field">
          <span>Observações</span>
          <textarea name="notes" rows={2} maxLength={500} placeholder="Opcional" />
        </label>
        <p className="client-profile-hint muted">
          Cliente opcional — você pode abrir a comanda e vincular depois pelos itens.
        </p>
      </form>
    </Modal>
  );
}
