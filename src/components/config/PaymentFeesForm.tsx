"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PaymentFeesFormView } from "@/server/tenant/payment-fees";
import type { PaymentFeesTable } from "@/lib/payment-fees";
import {
  resetPaymentFeesAction,
  savePaymentFeesAction,
} from "@/app/(painel)/configuracoes/taxas/actions";
import { useToast } from "@/components/ui/Toast";

type Props = { initial: PaymentFeesFormView };

function PctInput({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <input
        name={name}
        className="search-input"
        type="number"
        min={0}
        max={100}
        step={0.01}
        defaultValue={defaultValue}
        required
      />
    </label>
  );
}

export function PaymentFeesForm({ initial }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function readForm(fd: FormData): PaymentFeesTable {
    const num = (key: string) => Number(String(fd.get(key) ?? "").replace(",", "."));
    return {
      debit: {
        visa_master: num("debit_vm"),
        elo_amex: num("debit_ea"),
      },
      credit: {
        visa_master: {
          1: num("credit_vm_1"),
          2: num("credit_vm_2"),
          3: num("credit_vm_3"),
          4: num("credit_vm_4"),
        },
        elo_amex: {
          1: num("credit_ea_1"),
          2: num("credit_ea_2"),
          3: num("credit_ea_3"),
          4: num("credit_ea_4"),
        },
      },
    };
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    startTransition(async () => {
      const result = await savePaymentFeesAction(readForm(fd));
      if (!result.ok) {
        setErr(result.error);
        showToast(result.error, "error");
        return;
      }
      showToast("Taxas salvas — o líquido do Caixa usa estes %", "success");
      router.refresh();
    });
  }

  function onReset() {
    setErr(null);
    startTransition(async () => {
      const result = await resetPaymentFeesAction();
      if (!result.ok) {
        setErr(result.error);
        showToast(result.error, "error");
        return;
      }
      showToast("Padrão restaurado", "success");
      router.refresh();
    });
  }

  return (
    <form
      className="form-stack"
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      <p className="client-profile-hint">
        Percentuais da maquininha deste local. Usados só no <strong>líquido do Caixa</strong> —
        não alteram valor de comanda nem o que o cliente paga.
        {initial.isCustom ? null : (
          <>
            {" "}
            <strong>Usando padrão inicial</strong> — ajuste e salve para o seu contrato.
          </>
        )}
      </p>
      {err ? <div className="form-error">{err}</div> : null}

      <section>
        <h3 className="section-title">Débito (%)</h3>
        <div className="empresa-grid">
          <PctInput name="debit_vm" label="Visa / Master" defaultValue={initial.debit.visa_master} />
          <PctInput name="debit_ea" label="Elo / Amex" defaultValue={initial.debit.elo_amex} />
        </div>
      </section>

      <section>
        <h3 className="section-title">Crédito Visa / Master (%)</h3>
        <div className="empresa-grid">
          <PctInput name="credit_vm_1" label="1x" defaultValue={initial.credit.visa_master[1]!} />
          <PctInput name="credit_vm_2" label="2x" defaultValue={initial.credit.visa_master[2]!} />
          <PctInput name="credit_vm_3" label="3x" defaultValue={initial.credit.visa_master[3]!} />
          <PctInput name="credit_vm_4" label="4x" defaultValue={initial.credit.visa_master[4]!} />
        </div>
      </section>

      <section>
        <h3 className="section-title">Crédito Elo / Amex (%)</h3>
        <div className="empresa-grid">
          <PctInput name="credit_ea_1" label="1x" defaultValue={initial.credit.elo_amex[1]!} />
          <PctInput name="credit_ea_2" label="2x" defaultValue={initial.credit.elo_amex[2]!} />
          <PctInput name="credit_ea_3" label="3x" defaultValue={initial.credit.elo_amex[3]!} />
          <PctInput name="credit_ea_4" label="4x" defaultValue={initial.credit.elo_amex[4]!} />
        </div>
      </section>

      <div className="form-row-2" style={{ gap: 8 }}>
        <button
          type="submit"
          className={`btn btn-primary${pending ? " is-pending" : ""}`}
          disabled={pending}
        >
          {pending ? "Salvando…" : "Salvar taxas"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={pending || !initial.isCustom}
          onClick={onReset}
        >
          Restaurar padrão
        </button>
      </div>
    </form>
  );
}
