import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelOrderStatus } from "@/lib/format";
import type { OrderRow } from "@/lib/comandas";

type Props = {
  rows: OrderRow[];
  showClosed?: boolean;
};

export function OrdersTable({ rows, showClosed = true }: Props) {
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={showClosed ? 8 : 7} className="table-empty">
                Nenhuma comanda encontrada.
              </td>
            </tr>
          ) : (
            rows.map((o) => (
              <tr key={o.id}>
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
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
