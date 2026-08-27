"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import type {
  CatalogProduct,
  CatalogService,
  CatalogStaff,
  OrderDetail,
  OrderPermissions,
} from "@/server/orders/types";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelOrderStatus, labelPaymentMethod } from "@/lib/format";
import {
  addOrderItemAction,
  addPaymentAction,
  cancelOrderAction,
  closeOrderAction,
  removeOrderItemAction,
  setOrderDiscountAction,
} from "@/app/(painel)/comandas/actions";

type Props = {
  open: boolean;
  order: OrderDetail;
  services: CatalogService[];
  products: CatalogProduct[];
  staff: CatalogStaff[];
  permissions: OrderPermissions;
  onClose: () => void;
  onChanged: () => void;
};

export function OrderDrawer({
  open,
  order,
  services,
  products,
  staff,
  permissions,
  onClose,
  onChanged,
}: Props) {
  const [error, setError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemType, setItemType] = useState<"service" | "product">("service");
  const [pending, startTransition] = useTransition();
  const isOpen = order.status === "open";
  const canEdit = permissions.canWrite && isOpen;

  const due = Math.max(0, order.totalCents - order.discountCents);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError("");
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Erro");
        return;
      }
      onChanged();
    });
  }

  function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("orderId", order.id);
    formData.set("itemType", itemType);
    run(async () => {
      const result = await addOrderItemAction(formData);
      if (result.ok) form.reset();
      return result;
    });
  }

  function handleDiscount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const reais = Number(String(formData.get("discountReais") ?? "").replace(",", "."));
    run(() => setOrderDiscountAction(order.id, reais));
  }

  function handlePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("orderId", order.id);
    run(async () => {
      const result = await addPaymentAction(formData);
      if (result.ok) setPayOpen(false);
      return result;
    });
  }

  const catalog = itemType === "service" ? services : products;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={520}
        title={order.externalId ? `Comanda #${order.externalId}` : "Comanda"}
        subtitle={`${order.clientName ?? "Sem cliente"} · ${labelOrderStatus(order.status)}`}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
              Fechar painel
            </button>
            {canEdit && permissions.canCancel ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending}
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar
              </button>
            ) : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pending || order.balanceCents <= 0}
                  onClick={() => setPayOpen(true)}
                >
                  Pagar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending || order.balanceCents > 0 || order.items.length === 0}
                  onClick={() => run(() => closeOrderAction(order.id))}
                  title={
                    order.balanceCents > 0
                      ? "Quite o saldo antes de fechar"
                      : order.items.length === 0
                        ? "Adicione itens"
                        : "Fechar comanda"
                  }
                >
                  {pending ? "…" : "Fechar comanda"}
                </button>
              </>
            ) : null}
          </>
        }
      >
        {error ? <div className="form-error">{error}</div> : null}

        <div className="client-stats">
          <div className="client-stat">
            <span className="meta-label">Total</span>
            <strong>{formatMoney(order.totalCents)}</strong>
          </div>
          <div className="client-stat">
            <span className="meta-label">Desconto</span>
            <strong>{formatMoney(order.discountCents)}</strong>
          </div>
          <div className="client-stat">
            <span className="meta-label">Pago</span>
            <strong>{formatMoney(order.paidCents)}</strong>
          </div>
          <div className="client-stat">
            <span className="meta-label">Saldo</span>
            <strong>{formatMoney(order.balanceCents)}</strong>
          </div>
        </div>

        <p className="client-profile-hint">
          Aberta em {formatDateTimeSp(order.openedAt)}
          {order.closedAt ? ` · Fechada ${formatDateTimeSp(order.closedAt)}` : null}
        </p>

        <h3 className="client-profile-heading">Itens</h3>
        {order.items.length === 0 ? (
          <p className="client-profile-empty">Nenhum item ainda.</p>
        ) : (
          <ul className="order-item-list">
            {order.items.map((item) => (
              <li key={item.id} className="order-item-row">
                <div>
                  <strong>{item.description}</strong>
                  <span className="muted">
                    {item.qty}x · {item.staffName ?? "Sem profissional"}
                    {item.commissionCents != null
                      ? ` · comissão ${formatMoney(item.commissionCents)}`
                      : ""}
                  </span>
                </div>
                <div className="order-item-actions">
                  <strong>{formatMoney(item.totalCents)}</strong>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => run(() => removeOrderItemAction(item.id, order.id))}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form className="form-stack order-add-item" onSubmit={handleAddItem}>
            <div className="form-row-2">
              <label className="form-field">
                <span>Tipo</span>
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as "service" | "product")}
                >
                  <option value="service">Serviço</option>
                  <option value="product">Produto</option>
                </select>
              </label>
              <label className="form-field">
                <span>Qtd</span>
                <input name="qty" type="number" min={1} max={99} defaultValue={1} />
              </label>
            </div>
            <label className="form-field">
              <span>{itemType === "service" ? "Serviço" : "Produto"} *</span>
              <select name="catalogId" required defaultValue="">
                <option value="" disabled>
                  Selecione…
                </option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {formatMoney(c.priceCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Profissional</span>
              <select name="staffId" defaultValue="">
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Desconto no item (R$)</span>
              <input name="discountReais" type="number" min={0} step={0.01} defaultValue={0} />
            </label>
            <button type="submit" className="btn btn-outline" disabled={pending}>
              + Adicionar item
            </button>
          </form>
        ) : null}

        {canEdit ? (
          <form className="form-stack" onSubmit={handleDiscount} style={{ marginTop: 12 }}>
            <label className="form-field">
              <span>Desconto da comanda (R$)</span>
              <div className="form-row-2">
                <input
                  name="discountReais"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={(order.discountCents / 100).toFixed(2)}
                />
                <button type="submit" className="btn btn-outline" disabled={pending}>
                  Aplicar
                </button>
              </div>
            </label>
          </form>
        ) : null}

        <h3 className="client-profile-heading">Pagamentos</h3>
        {order.payments.length === 0 ? (
          <p className="client-profile-empty">Nenhum pagamento.</p>
        ) : (
          <ul className="order-item-list">
            {order.payments.map((p) => (
              <li key={p.id} className="order-item-row">
                <div>
                  <strong>{labelPaymentMethod(p.method)}</strong>
                  <span className="muted">{formatDateTimeSp(p.paidAt)}</span>
                </div>
                <strong>{formatMoney(p.amountCents)}</strong>
              </li>
            ))}
          </ul>
        )}

        <p className="client-profile-hint muted">
          A pagar: {formatMoney(due)} · Saldo: {formatMoney(order.balanceCents)}
        </p>
      </Drawer>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Registrar pagamento"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPayOpen(false)}
              disabled={pending}
            >
              Cancelar
            </button>
            <button type="submit" form="pay-form" className="btn btn-primary" disabled={pending}>
              {pending ? "…" : "Confirmar"}
            </button>
          </>
        }
      >
        <form id="pay-form" className="form-stack" onSubmit={handlePayment}>
          <label className="form-field">
            <span>Forma *</span>
            <select name="method" required defaultValue="pix">
              <option value="pix">PIX</option>
              <option value="cash">Dinheiro</option>
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
              <option value="transfer">Transferência</option>
              <option value="other">Outro</option>
            </select>
          </label>
          <label className="form-field">
            <span>Valor (R$) *</span>
            <input
              name="amountReais"
              type="number"
              min={0.01}
              step={0.01}
              required
              defaultValue={(order.balanceCents / 100).toFixed(2)}
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancelar comanda"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmCancel(false)}
              disabled={pending}
            >
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await cancelOrderAction(order.id);
                  if (result.ok) {
                    setConfirmCancel(false);
                    onClose();
                  }
                  return result;
                })
              }
            >
              Confirmar cancelamento
            </button>
          </>
        }
      >
        <p>
          A comanda será cancelada. Só é permitido se ainda não houver pagamentos
          registrados.
        </p>
      </Modal>
    </>
  );
}
