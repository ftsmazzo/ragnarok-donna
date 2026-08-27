"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { createAdvanceAction } from "@/app/(painel)/comissoes/actions";

type StaffOpt = { id: string; name: string };

type Props = {
  staffList: StaffOpt[];
  defaultStaffId?: string;
  buttonLabel?: string;
};

export function CommissionAdvancePanel({
  staffList,
  defaultStaffId,
  buttonLabel = "Lançar vale / ajuste",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createAdvanceAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Erro");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Vale, bônus, desconto ou pagamento"
      >
        <form action={submit} className="form-stack">
          {error ? <div className="form-error">{error}</div> : null}
          <label className="filter-field">
            <span>Profissional</span>
            <select
              name="staffId"
              required
              defaultValue={defaultStaffId ?? ""}
              className="search-input"
            >
              <option value="" disabled>
                Selecione
              </option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Tipo</span>
            <select name="kind" defaultValue="vale" className="search-input">
              <option value="vale">Vale / adiantamento</option>
              <option value="bonus">Bonificação</option>
              <option value="discount">Desconto na comissão</option>
              <option value="payout">Pagamento de comissão</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Valor (R$)</span>
            <input
              name="amountReais"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="search-input"
            />
          </label>
          <label className="filter-field">
            <span>Observação</span>
            <input name="notes" className="search-input" placeholder="Opcional" />
          </label>
          <label className="check-row">
            <input type="checkbox" name="linkCashOut" value="1" defaultChecked />
            <span>Se for vale, debitar do caixa aberto</span>
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Salvando…" : "Registrar"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
