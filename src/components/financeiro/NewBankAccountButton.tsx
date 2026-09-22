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
      <Modal open={open} onClose={() => setOpen(false)} title="Nova conta bancária">
        <form
          className="form-grid"
          style={{ gap: 10 }}
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
                showToast("Conta criada");
                setOpen(false);
                router.refresh();
              } else showToast(res.error, "error");
            });
          }}
        >
          <label>
            Nome
            <input name="name" required className="search-input" />
          </label>
          <label>
            Instituição
            <input name="institution" className="search-input" />
          </label>
          <label>
            Tipo
            <select name="accountType" className="search-input" defaultValue="checking">
              <option value="checking">Corrente</option>
              <option value="savings">Poupança</option>
              <option value="internal">Caixa interno</option>
              <option value="other">Outro</option>
            </select>
          </label>
          <label>
            Código
            <input name="bankCode" className="search-input" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              Saldo inicial (R$)
              <input name="opening" type="number" step="0.01" defaultValue={0} className="search-input" />
            </label>
            <label>
              Data saldo
              <input name="openingDate" type="date" className="search-input" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
