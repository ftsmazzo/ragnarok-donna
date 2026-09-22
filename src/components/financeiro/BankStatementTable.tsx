"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { reconcileEntryAction } from "@/app/(painel)/financeiro/actions";
import type { FinanceEntryRow } from "@/server/treasury/types";
import { formatMoney } from "@/lib/format";

type Props = {
  entries: FinanceEntryRow[];
  canWrite: boolean;
};

export function BankStatementTable({ entries, canWrite }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>C/D</th>
            <th>Descrição</th>
            <th style={{ textAlign: "right" }}>Valor</th>
            <th>Conciliado</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{e.dueDate ?? e.issueDate ?? "—"}</td>
              <td>{e.direction === "credit" ? "C" : "D"}</td>
              <td>{e.description}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(e.amountCents)}</td>
              <td>
                {canWrite ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await reconcileEntryAction(e.id, !e.reconciledAt);
                        if (res.ok) {
                          showToast(e.reconciledAt ? "Desconciliado" : "Conciliado");
                          router.refresh();
                        } else showToast(res.error, "error");
                      })
                    }
                  >
                    {e.reconciledAt ? "Sim" : "Marcar"}
                  </button>
                ) : e.reconciledAt ? (
                  "Sim"
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
