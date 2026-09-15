"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import type {
  CatalogPackage,
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
  payAndCloseOrderAction,
  reopenOrderAction,
  removeOrderItemAction,
  setOrderDiscountAction,
} from "@/app/(painel)/comandas/actions";
import { renewOrTopUpClientPackageAction } from "@/app/(painel)/clientes/actions";

type Props = {
  open: boolean;
  order: OrderDetail;
  services: CatalogService[];
  products: CatalogProduct[];
  packages: CatalogPackage[];
  staff: CatalogStaff[];
  permissions: OrderPermissions;
  onClose: () => void;
  onChanged: () => void;
};

type ItemType = "service" | "product" | "package";

export function OrderDrawer({
  open,
  order,
  services,
  products,
  packages,
  staff,
  permissions,
  onClose,
  onChanged,
}: Props) {
  const [error, setError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payCloseOpen, setPayCloseOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemType, setItemType] = useState<ItemType>("service");
  const [catalogId, setCatalogId] = useState("");
  const [useCredit, setUseCredit] = useState(true);
  const [pending, startTransition] = useTransition();
  const isOpen = order.status === "open";
  const canEdit = permissions.canWrite && isOpen;
  const due = Math.max(0, order.totalCents - order.discountCents);
  const credits = order.credits ?? [];

  const creditByService = new Map<string, number>();
  const creditByProduct = new Map<string, number>();
  for (const c of credits) {
    if (c.serviceId) {
      creditByService.set(
        c.serviceId,
        (creditByService.get(c.serviceId) ?? 0) + c.remainingQty
      );
    }
    if (c.productId) {
      creditByProduct.set(
        c.productId,
        (creditByProduct.get(c.productId) ?? 0) + c.remainingQty
      );
    }
  }
  const selectedCreditQty =
    itemType === "service" && catalogId
      ? creditByService.get(catalogId) ?? 0
      : itemType === "product" && catalogId
        ? creditByProduct.get(catalogId) ?? 0
        : 0;
  const willUseCredit =
    (itemType === "service" || itemType === "product") &&
    useCredit &&
    selectedCreditQty > 0;
  const selectedPackage =
    itemType === "package" && catalogId
      ? packages.find((p) => p.id === catalogId) ?? null
      : null;

  const creditsByPackage = new Map<
    string,
    { clientPackageId: string; packageName: string; lines: typeof credits }
  >();
  for (const c of credits) {
    const cur = creditsByPackage.get(c.clientPackageId) ?? {
      clientPackageId: c.clientPackageId,
      packageName: c.packageName,
      lines: [],
    };
    cur.lines.push(c);
    creditsByPackage.set(c.clientPackageId, cur);
  }

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
    formData.set("catalogId", catalogId);
    if (willUseCredit) formData.set("usePackageCredit", "1");
    run(async () => {
      const result = await addOrderItemAction(formData);
      if (result.ok) {
        form.reset();
        setCatalogId("");
        setItemType("service");
        setUseCredit(true);
      }
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

  const catalog =
    itemType === "service" ? services : itemType === "product" ? products : packages;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={560}
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
                  disabled={pending || order.items.length === 0}
                  onClick={() => {
                    if (order.balanceCents > 0) setPayCloseOpen(true);
                    else run(() => closeOrderAction(order.id));
                  }}
                  title="Paga o saldo (se houver) e fecha a comanda"
                >
                  {pending
                    ? "…"
                    : order.balanceCents > 0
                      ? "Pagar e fechar"
                      : "Fechar comanda"}
                </button>
              </>
            ) : null}
            {!isOpen && order.status === "closed" && permissions.canReopen ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => run(() => reopenOrderAction(order.id))}
              >
                Reabrir comanda
              </button>
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

        {order.clientId ? (
          <section className="order-wallet">
            <div className="order-wallet-head">
              <strong>Carteira de pacotes</strong>
              <span>
                {credits.length > 0
                  ? `${credits.reduce((s, c) => s + c.remainingQty, 0)} crédito(s) disponível(is)`
                  : "Sem créditos"}
              </span>
            </div>
            {credits.length === 0 ? (
              <p className="order-wallet-empty">
                Cliente sem créditos. Em Tipo escolha Pacote → Vender pacote / gerar carteira.
              </p>
            ) : (
              <ul className="order-wallet-list">
                {[...creditsByPackage.values()].map((group) => (
                  <li key={group.clientPackageId}>
                    <div>
                      <strong>{group.packageName}</strong>
                      <span>
                        {group.lines
                          .map(
                            (c) =>
                              `${c.remainingQty}× ${c.serviceName ?? c.productName ?? "Item"}`
                          )
                          .join(" · ")}
                      </span>
                    </div>
                    <div className="order-wallet-line-actions">
                      <em>
                        {group.lines.reduce((s, c) => s + c.remainingQty, 0)} rest.
                        {group.lines[0]?.expiresAt
                          ? ` · até ${formatDateTimeSp(group.lines[0].expiresAt).slice(0, 10)}`
                          : ""}
                      </em>
                      {canEdit ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              renewOrTopUpClientPackageAction({
                                clientPackageId: group.clientPackageId,
                                mode: "topup",
                                orderId: order.id,
                              })
                            )
                          }
                        >
                          Repor
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="order-wallet-warn">
            Comanda sem cliente: não dá para vender/usar pacote. Abra com cliente vinculado.
          </p>
        )}

        <h3 className="client-profile-heading">Itens</h3>
        {order.items.length === 0 ? (
          <p className="client-profile-empty">Nenhum item ainda.</p>
        ) : (
          <ul className="order-item-list">
            {order.items.map((item) => (
              <li key={item.id} className="order-item-row">
                <div>
                  <strong>
                    {item.description}
                    {item.redeemed ? (
                      <span className="order-badge is-credit">Crédito</span>
                    ) : null}
                    {item.packageSale ? (
                      <span className="order-badge is-package">
                        {item.walletPending
                          ? "Venda pacote · libera ao fechar"
                          : "Venda pacote"}
                      </span>
                    ) : null}
                  </strong>
                  <span className="muted">
                    {item.qty}x · {item.staffName ?? "Sem profissional"}
                    {item.commissionCents != null
                      ? ` · comissão ${formatMoney(item.commissionCents)}`
                      : ""}
                    {item.redeemed
                      ? ` · tabela ${formatMoney(item.unitPriceCents)} abatida`
                      : ""}
                  </span>
                </div>
                <div className="order-item-actions">
                  <strong className={item.redeemed ? "is-zero" : undefined}>
                    {formatMoney(item.totalCents)}
                  </strong>
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
                  onChange={(e) => {
                    setItemType(e.target.value as ItemType);
                    setCatalogId("");
                  }}
                >
                  <option value="service">Serviço</option>
                  <option value="product">Produto</option>
                  <option value="package">Vender pacote</option>
                </select>
              </label>
              <label className="form-field">
                <span>Qtd</span>
                <input
                  name="qty"
                  type="number"
                  min={1}
                  max={99}
                  defaultValue={1}
                  disabled={willUseCredit || itemType === "package"}
                />
              </label>
            </div>
            <label className="form-field">
              <span>
                {itemType === "service"
                  ? "Serviço"
                  : itemType === "product"
                    ? "Produto"
                    : "Pacote"}{" "}
                *
              </span>
              <select
                required
                value={catalogId}
                onChange={(e) => setCatalogId(e.target.value)}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"itemLabel" in c && c.itemLabel
                      ? `${c.name} · ${formatMoney(c.priceCents)} · ${c.itemLabel}`
                      : `${c.name} · ${formatMoney(c.priceCents)}`}
                    {itemType === "service" && creditByService.has(c.id)
                      ? ` · ${creditByService.get(c.id)} créd.`
                      : itemType === "product" && creditByProduct.has(c.id)
                        ? ` · ${creditByProduct.get(c.id)} créd.`
                        : ""}
                  </option>
                ))}
              </select>
            </label>

            {(itemType === "service" || itemType === "product") &&
            selectedCreditQty > 0 ? (
              <label
                className={
                  useCredit
                    ? "form-check order-credit-toggle is-on"
                    : "form-check order-credit-toggle"
                }
              >
                <input
                  type="checkbox"
                  checked={useCredit}
                  onChange={(e) => setUseCredit(e.target.checked)}
                />
                <span>
                  {useCredit
                    ? `1 crédito — R$ 0 (${selectedCreditQty} disponível${selectedCreditQty > 1 ? "s" : ""}). Desmarque para cobrar avulso.`
                    : `Cobrar avulso (há ${selectedCreditQty} crédito${selectedCreditQty > 1 ? "s" : ""} — marque para abater).`}
                </span>
              </label>
            ) : null}

            {itemType === "package" ? (
              <div className="order-package-sale-hint">
                <p>
                  <strong>Vender pacote / gerar carteira</strong> — o cliente paga nesta
                  comanda; os créditos só liberam ao fechar/pagar (sem crédito órfão).
                </p>
                {selectedPackage?.itemLabel ? (
                  <p className="muted">Incluso: {selectedPackage.itemLabel}</p>
                ) : (
                  <p className="muted">Selecione o pacote para ver os créditos que serão criados.</p>
                )}
              </div>
            ) : null}

            <label className="form-field">
              <span>Profissional {itemType === "service" ? "*" : ""}</span>
              <select name="staffId" defaultValue="" required={itemType === "service"}>
                <option value="" disabled={itemType === "service"}>
                  {itemType === "service" ? "Selecione…" : "—"}
                </option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {itemType !== "package" && !willUseCredit ? (
              <label className="form-field">
                <span>Desconto no item (R$)</span>
                <input name="discountReais" type="number" min={0} step={0.01} defaultValue={0} />
              </label>
            ) : null}
            <button type="submit" className="btn btn-outline" disabled={pending || !catalogId}>
              {itemType === "package"
                ? "+ Vender pacote / gerar carteira"
                : willUseCredit
                  ? "+ Lançar com 1 crédito (R$ 0)"
                  : "+ Adicionar item"}
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
              <option value="pix_key">PIX chave</option>
              <option value="rede_link">Link Rede</option>
              <option value="infinity">Maquininha Infinity</option>
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
        open={payCloseOpen}
        onClose={() => setPayCloseOpen(false)}
        title="Pagar e fechar comanda"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPayCloseOpen(false)}
              disabled={pending}
            >
              Voltar
            </button>
            <button
              type="submit"
              form="pay-close-form"
              className="btn btn-primary"
              disabled={pending}
            >
              {pending ? "…" : "Confirmar e fechar"}
            </button>
          </>
        }
      >
        <form
          id="pay-close-form"
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            formData.set("orderId", order.id);
            run(async () => {
              const result = await payAndCloseOrderAction(formData);
              if (result.ok) {
                setPayCloseOpen(false);
                onClose();
              }
              return result;
            });
          }}
        >
          <p className="client-profile-hint">
            Vai registrar{" "}
            <strong>{formatMoney(order.balanceCents)}</strong> e fechar a comanda.
          </p>
          <label className="form-field">
            <span>Forma *</span>
            <select name="method" required defaultValue="pix">
              <option value="pix">PIX</option>
              <option value="pix_key">PIX chave</option>
              <option value="rede_link">Link Rede</option>
              <option value="infinity">Maquininha Infinity</option>
              <option value="cash">Dinheiro</option>
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
              <option value="transfer">Transferência</option>
              <option value="other">Outro</option>
            </select>
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
