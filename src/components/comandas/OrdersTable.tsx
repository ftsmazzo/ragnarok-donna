"use client";

import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelOrderStatus } from "@/lib/format";
import type { OrderRow } from "@/lib/comandas";

type Props = {
  rows: OrderRow[];
  showClosed?: boolean;
  onRowClick?: (id: string) => void;
  onReopen?: (id: string) => void;
  canReopen?: boolean;
  selectedId?: string | null;
  pendingId?: string | null;
};

export function OrdersTable({
  rows,
  showClosed = true,
  onRowClick,
  onReopen,
  canReopen = false,
  selectedId,
  pendingId,
}: Props) {
  const showActions = Boolean(onReopen && canReopen);
  const colSpan = (showClosed ? 8 : 7) + (showActions ? 1 : 0);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Profissional</th>
            <th>Abertura</th>
            {showClosed ? <th>Fechamento</th> : null}
            <th>Itens</th>
            <th>Total</th>
            <th>Status</th>
            {showActions ? <th>Ações</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="table-empty">
                Nenhuma comanda encontrada.
              </td>
            </tr>
          ) : (
            rows.map((o) => (
              <tr
                key={o.id}
                className={`${onRowClick ? "is-clickable" : ""}${
                  selectedId === o.id ? " is-selected" : ""
                }`}
                onClick={onRowClick ? () => onRowClick(o.id) : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                <td>{o.externalId ?? o.id.slice(0, 8)}</td>
                <td className="cell-strong">{o.clientName ?? "—"}</td>
                <td>{o.profissional ?? "—"}</td>
                <td>{formatDateTimeSp(o.openedAt)}</td>
                {showClosed ? (
                  <td>{o.closedAt ? formatDateTimeSp(o.closedAt) : "—"}</td>
                ) : null}
                <td>{o.itemCount}</td>
                <td>{formatMoney(o.totalCents)}</td>
                <td>
                  <span
                    className={`badge${
                      o.status === "open"
                        ? " is-warn"
                        : o.status === "closed"
                          ? " is-success"
                          : " is-muted"
                    }`}
                  >
                    {labelOrderStatus(o.status)}
                  </span>
                </td>
                {showActions ? (
                  <td onClick={(e) => e.stopPropagation()}>
                    {o.status === "closed" ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={pendingId === o.id}
                        onClick={() => onReopen?.(o.id)}
                      >
                        {pendingId === o.id ? "…" : "Reabrir"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
