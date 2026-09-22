"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { saveBankAccountAction } from "@/app/(painel)/financeiro/actions";

export function NewBankAccountButton({ canWrite }: { canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  if (!canWrite) return null;

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Conta bancária
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova conta bancária"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="treasury-bank-form"
              className="btn btn-primary"
              disabled={pending}
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form
          id="treasury-bank-form"
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await saveBankAccountAction({
                name: String(fd.get("name") || ""),
                institution: String(fd.get("institution") || "") || undefined,
                accountType: String(fd.get("accountType") || "checking") as
                  | "checking"
                  | "savings"
                  | "internal"
                  | "other",
                bankCode: String(fd.get("bankCode") || "") || undefined,
                openingBalanceCents: Math.round(
                  Number(String(fd.get("opening") || "0").replace(",", ".")) * 100
                ),
                openingBalanceDate: String(fd.get("openingDate") || "") || undefined,
              });
              if (res.ok) {
                showToast("Conta criada", "success");
                setOpen(false);
                router.refresh();
              } else showToast(res.error, "error");
            });
          }}
        >
          <label className="form-field">
            <span>Nome</span>
            <input name="name" required autoFocus />
          </label>
          <label className="form-field">
            <span>Instituição</span>
            <input name="institution" placeholder="Ex.: Itaú, Bradesco, Caixa" />
          </label>
          <label className="form-field">
            <span>Tipo</span>
            <select name="accountType" defaultValue="checking">
              <option value="checking">Corrente</option>
              <option value="savings">Poupança</option>
              <option value="internal">Caixa interno</option>
              <option value="other">Outro</option>
            </select>
          </label>
          <label className="form-field">
            <span>Código (opcional)</span>
            <input name="bankCode" />
          </label>
          <div className="form-row-2">
            <label className="form-field">
              <span>Saldo inicial (R$)</span>
              <input name="opening" type="number" step="0.01" defaultValue={0} />
            </label>
            <label className="form-field">
              <span>Data do saldo</span>
              <input name="openingDate" type="date" />
            </label>
          </div>
        </form>
      </Modal>
    </>
  );
}
