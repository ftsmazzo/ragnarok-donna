"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { saveCreditCardAction, openCardInvoiceAction } from "@/app/(painel)/financeiro/actions";
import { todaySp } from "@/lib/datetime";

export function NewCreditCardButton({ canWrite }: { canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  if (!canWrite) return null;

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Cartão
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo cartão de crédito"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="treasury-card-form"
              className="btn btn-primary"
              disabled={pending}
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form
          id="treasury-card-form"
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await saveCreditCardAction({
                name: String(fd.get("name") || ""),
                institution: String(fd.get("institution") || "") || undefined,
                limitCents: Math.round(
                  Number(String(fd.get("limit") || "0").replace(",", ".")) * 100
                ),
                closingDay: Number(fd.get("closingDay") || 1),
                dueDay: Number(fd.get("dueDay") || 10),
              });
              if (res.ok) {
                showToast("Cartão cadastrado", "success");
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
            <span>Bandeira / banco</span>
            <input name="institution" />
          </label>
          <label className="form-field">
            <span>Limite (R$)</span>
            <input name="limit" type="number" step="0.01" required />
          </label>
          <div className="form-row-2">
            <label className="form-field">
              <span>Dia fechamento</span>
              <input name="closingDay" type="number" min={1} max={28} defaultValue={1} />
            </label>
            <label className="form-field">
              <span>Dia vencimento</span>
              <input name="dueDay" type="number" min={1} max={28} defaultValue={10} />
            </label>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function OpenInvoiceButton({
  creditCardId,
  canWrite,
}: {
  creditCardId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  const today = todaySp();

  return (
    <button
      type="button"
      className="btn btn-sm btn-outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const [y, m] = today.split("-").map(Number);
          const start = `${y}-${String(m).padStart(2, "0")}-01`;
          const endDay = new Date(y, m, 0).getDate();
          const end = `${y}-${String(m).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
          const due = `${y}-${String(m).padStart(2, "0")}-10`;
          const res = await openCardInvoiceAction({
            creditCardId,
            periodStart: start,
            periodEnd: end,
            dueDate: due,
          });
          if (res.ok) {
            showToast("Fatura aberta", "success");
            router.refresh();
          } else showToast(res.error, "error");
        })
      }
    >
      Abrir fatura do mês
    </button>
  );
}
