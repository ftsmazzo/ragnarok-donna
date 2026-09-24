"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { todaySp } from "@/lib/datetime";
import { openStaffConsumptionOrderAction } from "@/app/(painel)/comandas/actions";

type StaffOpt = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  staff: StaffOpt[];
};

export function OpenStaffConsumptionModal({ open, onClose, onCreated, staff }: Props) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await openStaffConsumptionOrderAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.id);
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Consumo de profissional"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button
            type="submit"
            form="staff-consumption-order-form"
            className={`btn btn-primary${pending ? " is-pending" : ""}`}
            disabled={pending || staff.length === 0}
            aria-busy={pending}
          >
            {pending ? "Abrindo…" : "Abrir comanda"}
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <form id="staff-consumption-order-form" className="form-stack" onSubmit={handleSubmit}>
        <p className="client-profile-hint muted">
          Como no AppBarber: serviço com valor e comissão, sem aparecer na agenda. Produto
          (coca/trufa −30%) continua em Comissões → Consumo do barbeiro.
        </p>
        <label className="form-field">
          <span>Profissional *</span>
          <select name="staffId" required defaultValue="" className="search-input">
            <option value="" disabled>
              Selecione
            </option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Data da comanda *</span>
          <input
            name="occurredOn"
            type="date"
            required
            defaultValue={todaySp()}
            className="search-input"
          />
        </label>
        <label className="form-field">
          <span>Observações</span>
          <textarea name="notes" rows={2} maxLength={500} placeholder="Opcional" />
        </label>
      </form>
    </Modal>
  );
}
