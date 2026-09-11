"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { staffConsumptionAmountCents } from "@/lib/staff-consumption";
import {
  addSaleProductAction,
  registerMyConsumptionAction,
} from "@/app/pwa/consumo/actions";

type OrderRow = {
  id: string;
  clientName: string | null;
  totalCents: number;
  itemCount: number;
};

type ProductRow = {
  id: string;
  name: string;
  priceCents: number;
  stockQty: number;
};

type Tab = "venda" | "consumo";

type Props = {
  brandName: string;
  orders: OrderRow[];
  products: ProductRow[];
};

export function ConsumoMobileApp({ brandName, orders, products }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("venda");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === orderId) ?? null,
    [orders, orderId]
  );

  const inStock = products.filter((p) => p.stockQty > 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string; amountCents?: number }>, success: string) {
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Falha");
        return;
      }
      setOkMsg(success);
      router.refresh();
    });
  }

  return (
    <div className="consumo-app">
      <header className="minbox-head">
        <div>
          <strong>{brandName}</strong>
          <p>Venda e consumo</p>
        </div>
        <Link href="/agenda?modo=tablet" className="minbox-panel-link">
          Agenda
        </Link>
      </header>

      <div className="minbox-filters">
        <button
          type="button"
          className={`minbox-tab${tab === "venda" ? " is-on" : ""}`}
          onClick={() => {
            setTab("venda");
            setError(null);
            setOkMsg(null);
          }}
        >
          Venda
        </button>
        <button
          type="button"
          className={`minbox-tab${tab === "consumo" ? " is-on" : ""}`}
          onClick={() => {
            setTab("consumo");
            setOrderId(null);
            setError(null);
            setOkMsg(null);
          }}
        >
          Meu consumo
        </button>
      </div>

      {error ? <div className="consumo-flash is-err">{error}</div> : null}
      {okMsg ? <div className="consumo-flash is-ok">{okMsg}</div> : null}

      {tab === "venda" && !selectedOrder ? (
        <div className="minbox-list">
          {orders.length === 0 ? (
            <p className="minbox-empty">Nenhuma comanda aberta sua. Peça à recepção para abrir.</p>
          ) : (
            orders.map((o) => (
              <button
                key={o.id}
                type="button"
                className="minbox-item"
                onClick={() => setOrderId(o.id)}
              >
                <div className="minbox-item-top">
                  <strong>{o.clientName ?? "Sem cliente"}</strong>
                  <span>{formatMoney(o.totalCents)}</span>
                </div>
                <p className="minbox-item-preview">{o.itemCount} item(ns) · toque para vender</p>
              </button>
            ))
          )}
        </div>
      ) : null}

      {tab === "venda" && selectedOrder ? (
        <div className="consumo-panel">
          <button type="button" className="consumo-back" onClick={() => setOrderId(null)}>
            ← Comandas
          </button>
          <h2 className="consumo-title">{selectedOrder.clientName ?? "Sem cliente"}</h2>
          <p className="consumo-hint">Toque no produto para lançar na comanda (preço cheio).</p>
          <div className="consumo-products">
            {inStock.length === 0 ? (
              <p className="minbox-empty">Sem produtos em estoque.</p>
            ) : (
              inStock.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="consumo-product"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => addSaleProductAction(selectedOrder.id, p.id, 1),
                      `${p.name} adicionado à comanda`
                    )
                  }
                >
                  <strong>{p.name}</strong>
                  <span>
                    {formatMoney(p.priceCents)} · estoque {p.stockQty}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "consumo" ? (
        <div className="consumo-panel">
          <p className="consumo-hint">
            Desconta da sua comissão: <strong>preço de venda − 30%</strong>. Baixa o estoque.
          </p>
          <div className="consumo-products">
            {inStock.length === 0 ? (
              <p className="minbox-empty">Sem produtos em estoque.</p>
            ) : (
              inStock.map((p) => {
                const debit = staffConsumptionAmountCents(p.priceCents, 1);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="consumo-product is-consumo"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => registerMyConsumptionAction(p.id, 1),
                        `${p.name}: desconto ${formatMoney(debit)}`
                      )
                    }
                  >
                    <strong>{p.name}</strong>
                    <span>
                      Venda {formatMoney(p.priceCents)} → desconto {formatMoney(debit)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
