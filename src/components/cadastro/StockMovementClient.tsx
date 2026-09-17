"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postStockMovementAction } from "@/app/(painel)/cadastros/actions";
import { formatDateTimeSp } from "@/lib/datetime";

type ProductOpt = { id: string; name: string; stockQty: number };

type MovementRow = {
  id: string;
  productId: string;
  productName: string;
  deltaQty: number;
  qtyAfter: number;
  reason: string;
  notes: string | null;
  createdAt: Date;
};

type Props = {
  products: ProductOpt[];
  movements: MovementRow[];
};

function labelStockReason(reason: string): string {
  const map: Record<string, string> = {
    purchase: "Compra / entrada",
    adjust: "Ajuste manual",
    return: "Devolução",
    internal: "Uso interno",
    loss: "Perda / quebra",
    sale: "Venda",
  };
  return map[reason] ?? reason;
}

export function StockMovementClient({ products, movements }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="client-profile-section">
      {error ? <p className="form-error">{error}</p> : null}

      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          setError("");
          startTransition(async () => {
            const result = await postStockMovementAction(fd);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            form.reset();
            router.refresh();
          });
        }}
      >
        <div className="form-row-2">
          <label className="form-field">
            <span>Produto *</span>
            <select name="productId" required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stockQty} un.)
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Tipo *</span>
            <select name="kind" defaultValue="in" required>
              <option value="in">Entrada (+)</option>
              <option value="out">Saída (−)</option>
            </select>
          </label>
        </div>
        <div className="form-row-2">
          <label className="form-field">
            <span>Quantidade *</span>
            <input name="qty" type="number" min={1} step={1} required defaultValue={1} />
          </label>
          <label className="form-field">
            <span>Motivo *</span>
            <select name="reason" defaultValue="purchase" required>
              <option value="purchase">Compra / entrada</option>
              <option value="adjust">Ajuste manual</option>
              <option value="return">Devolução</option>
              <option value="internal">Uso interno</option>
              <option value="loss">Perda / quebra</option>
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>Observação</span>
          <input name="notes" type="text" maxLength={240} placeholder="Opcional" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "…" : "Registrar movimentação"}
        </button>
      </form>

      <div className="client-profile-block" style={{ marginTop: 24 }}>
        <h3 className="section-title">Últimas movimentações</h3>
        {movements.length === 0 ? (
          <p className="muted-note">Nenhuma movimentação ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Produto</th>
                  <th>Motivo</th>
                  <th style={{ textAlign: "right" }}>Δ</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTimeSp(m.createdAt)}</td>
                    <td className="cell-strong">{m.productName}</td>
                    <td>
                      {labelStockReason(m.reason)}
                      {m.notes ? ` — ${m.notes}` : ""}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: m.deltaQty < 0 ? "var(--danger, #c62828)" : "var(--success, #2e7d32)",
                        fontWeight: 600,
                      }}
                    >
                      {m.deltaQty > 0 ? "+" : ""}
                      {m.deltaQty}
                    </td>
                    <td style={{ textAlign: "right" }}>{m.qtyAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
