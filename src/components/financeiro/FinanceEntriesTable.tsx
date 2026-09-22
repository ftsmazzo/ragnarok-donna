"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { SITUATION_LABEL } from "@/server/treasury/situation";
import type { FinanceEntryRow } from "@/server/treasury/types";
import { settleEntryAction, deleteEntryAction } from "@/app/(painel)/financeiro/actions";

type Props = {
  entries: FinanceEntryRow[];
  canWrite: boolean;
  showDirection?: boolean;
};

export function FinanceEntriesTable({ entries, canWrite, showDirection }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function settle(id: string) {
    startTransition(async () => {
      const res = await settleEntryAction({ id });
      if (res.ok) {
        showToast("Título baixado");
        router.refresh();
      } else {
        showToast(res.error, "error");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Excluir este título?")) return;
    startTransition(async () => {
      const res = await deleteEntryAction(id);
      if (res.ok) {
        showToast("Excluído");
        router.refresh();
      } else {
        showToast(res.error, "error");
      }
    });
  }

  if (!entries.length) {
    return (
      <p className="muted" style={{ padding: 16 }}>
        Nenhum título neste filtro.
      </p>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {showDirection ? <th>C/D</th> : null}
            <th>Venc.</th>
            <th>Descrição</th>
            <th>Parte</th>
            <th>Conta</th>
            <th>Situação</th>
            <th style={{ textAlign: "right" }}>Valor</th>
            {canWrite ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              {showDirection ? (
                <td>{e.direction === "credit" ? "C" : "D"}</td>
              ) : null}
              <td>{e.dueDate ?? "—"}</td>
              <td>
                {e.description}
                {e.installmentIndex && e.installmentTotal ? (
                  <span className="muted"> · {e.installmentIndex}/{e.installmentTotal}</span>
                ) : null}
              </td>
              <td>{e.partyName ?? "—"}</td>
              <td>
                {e.chartAccountCode
                  ? `${e.chartAccountCode} · ${e.chartAccountName ?? ""}`
                  : "—"}
              </td>
              <td>
                <span
                  className={
                    e.situation === "overdue"
                      ? "badge is-warn"
                      : e.situation === "settled"
                        ? "badge is-success"
                        : "badge is-muted"
                  }
                >
                  {SITUATION_LABEL[e.situation]}
                </span>
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(e.amountCents)}
              </td>
              {canWrite ? (
                <td style={{ whiteSpace: "nowrap" }}>
                  {e.situation !== "settled" ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      disabled={pending}
                      onClick={() => settle(e.id)}
                    >
                      Baixar
                    </button>
                  ) : null}{" "}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={pending}
                    onClick={() => remove(e.id)}
                  >
                    ×
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
