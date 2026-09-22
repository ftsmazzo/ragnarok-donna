"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { saveFinanceEntryAction } from "@/app/(painel)/financeiro/actions";
import type {
  BankAccountRow,
  ChartAccountRow,
  FinanceDirection,
  TreasuryPaymentMethodRow,
} from "@/server/treasury/types";

type Props = {
  direction: FinanceDirection;
  chartAccounts: ChartAccountRow[];
  bankAccounts: BankAccountRow[];
  paymentMethods: TreasuryPaymentMethodRow[];
  canWrite: boolean;
};

export function NewFinanceEntryButton({
  direction,
  chartAccounts,
  bankAccounts,
  paymentMethods,
  canWrite,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  if (!canWrite) return null;

  const formId = `treasury-entry-${direction}`;

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Novo título
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={direction === "debit" ? "Conta a pagar" : "Conta a receber"}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form={formId} className="btn btn-primary" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form
          id={formId}
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const amount = Math.round(
              Number(String(fd.get("amount") || "0").replace(",", ".")) * 100
            );
            const installmentTotal = Number(fd.get("installmentTotal") || 1);
            const recurrence = String(fd.get("recurrence") || "none") as
              | "none"
              | "weekly"
              | "biweekly"
              | "monthly"
              | "bimonthly";

            startTransition(async () => {
              const res = await saveFinanceEntryAction({
                direction,
                description: String(fd.get("description") || ""),
                partyName: String(fd.get("partyName") || "") || undefined,
                chartAccountId: String(fd.get("chartAccountId") || "") || null,
                bankAccountId: String(fd.get("bankAccountId") || "") || null,
                treasuryPaymentMethodId:
                  String(fd.get("treasuryPaymentMethodId") || "") || null,
                issueDate: String(fd.get("issueDate") || "") || null,
                dueDate: String(fd.get("dueDate") || "") || null,
                forecastCents: amount,
                installmentTotal,
                recurrence,
                generateInstallments: installmentTotal > 1 && recurrence !== "none",
                notes: String(fd.get("notes") || "") || undefined,
              });
              if (res.ok) {
                showToast(
                  direction === "debit" ? "Conta a pagar criada" : "Conta a receber criada",
                  "success"
                );
                setOpen(false);
                router.refresh();
              } else {
                showToast(res.error, "error");
              }
            });
          }}
        >
          <label className="form-field">
            <span>Descrição</span>
            <input name="description" required autoFocus />
          </label>
          <label className="form-field">
            <span>Cliente / fornecedor</span>
            <input name="partyName" />
          </label>
          <div className="form-row-2">
            <label className="form-field">
              <span>Emissão</span>
              <input name="issueDate" type="date" />
            </label>
            <label className="form-field">
              <span>Vencimento</span>
              <input name="dueDate" type="date" required />
            </label>
          </div>
          <label className="form-field">
            <span>Valor (R$)</span>
            <input name="amount" type="number" step="0.01" min="0" required />
          </label>
          <label className="form-field">
            <span>Conta (APR)</span>
            <select name="chartAccountId" defaultValue="">
              <option value="">—</option>
              {chartAccounts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row-2">
            <label className="form-field">
              <span>Banco</span>
              <select name="bankAccountId" defaultValue="">
                <option value="">—</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Meio</span>
              <select name="treasuryPaymentMethodId" defaultValue="">
                <option value="">—</option>
                {paymentMethods
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="form-row-2">
            <label className="form-field">
              <span>Parcelas</span>
              <input name="installmentTotal" type="number" min={1} max={60} defaultValue={1} />
            </label>
            <label className="form-field">
              <span>Recorrência</span>
              <select name="recurrence" defaultValue="none">
                <option value="none">Nenhuma</option>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quinzenal</option>
                <option value="monthly">Mensal</option>
                <option value="bimonthly">Bimensal</option>
              </select>
            </label>
          </div>
          <label className="form-field">
            <span>Observações</span>
            <input name="notes" />
          </label>
        </form>
      </Modal>
    </>
  );
}
