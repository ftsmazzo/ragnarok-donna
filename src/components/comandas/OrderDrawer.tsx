"use client";

import { useEffect, useState, useTransition } from "react";
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
  closeOrderToClientAccountAction,
  payAndCloseOrderAction,
  reopenOrderAction,
  removeOrderItemAction,
  setOrderClientAction,
  setOrderDiscountAction,
} from "@/app/(painel)/comandas/actions";
import { renewOrTopUpClientPackageAction } from "@/app/(painel)/clientes/actions";
import { ClientPicker } from "@/components/agenda/ClientPicker";
import { PaymentMethodSelect } from "@/lib/paymentMethods";
import type { ClientCreditBalance } from "@/server/packages/credits";

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

function parsePct(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Converte % → centavos sobre a base (preço ou residual). */
function discountCentsFromPercent(baseCents: number, percent: number): number {
  const pct = parsePct(percent);
  if (pct <= 0 || baseCents <= 0) return 0;
  return Math.round((baseCents * pct) / 100);
}

function orderDiscountPercent(totalCents: number, discountCents: number): string {
  if (totalCents <= 0 || discountCents <= 0) return "";
  return ((discountCents / totalCents) * 100).toFixed(2).replace(/\.?0+$/, "");
}

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
  const [itemDiscountPct, setItemDiscountPct] = useState("");
  const [coveredReais, setCoveredReais] = useState("");
  const [orderDiscountPct, setOrderDiscountPct] = useState(() =>
    orderDiscountPercent(order.totalCents, order.discountCents)
  );
  const [linkClientOpen, setLinkClientOpen] = useState(false);
  const [pickClientId, setPickClientId] = useState("");
  const [confirmTopUpId, setConfirmTopUpId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOpen = order.status === "open";
  const canEdit = permissions.canWrite && isOpen;
  const due = Math.max(0, order.totalCents - order.discountCents);
  const credits = order.credits ?? [];
  const clientAccountCents = order.clientAccountBalanceCents;
  const clientCreditAvailable =
    clientAccountCents != null && clientAccountCents > 0 ? clientAccountCents : 0;
  const hasPackageSale = order.items.some((item) => item.itemType === "package");

  useEffect(() => {
    setOrderDiscountPct(orderDiscountPercent(order.totalCents, order.discountCents));
  }, [order.id, order.totalCents, order.discountCents]);

  useEffect(() => {
    setCoveredReais("");
    setItemDiscountPct("");
  }, [catalogId, itemType]);

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
  const selectedCatalogPriceCents =
    catalogId && (itemType === "service" || itemType === "product")
      ? (itemType === "service" ? services : products).find((c) => c.id === catalogId)
          ?.priceCents ?? 0
      : 0;
  const coveredCentsPreview = willUseCredit
    ? coveredReais.trim() === ""
      ? selectedCatalogPriceCents
      : Math.max(
          0,
          Math.min(
            selectedCatalogPriceCents,
            Math.round(Number(String(coveredReais).replace(",", ".")) * 100) || 0
          )
        )
      : 0;
  const itemDiscountBaseCents = willUseCredit
    ? Math.max(0, selectedCatalogPriceCents - coveredCentsPreview)
    : selectedCatalogPriceCents;
  const itemDiscountCentsPreview = discountCentsFromPercent(
    itemDiscountBaseCents,
    parsePct(itemDiscountPct)
  );
  const orderDiscountCentsPreview = discountCentsFromPercent(
    order.totalCents,
    parsePct(orderDiscountPct)
  );
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

  const showClientLinker = canEdit && (!order.clientId || linkClientOpen);
  const packageBlockedNoClient = itemType === "package" && !order.clientId;

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

  function linkClient() {
    if (!pickClientId) return;
    run(async () => {
      const result = await setOrderClientAction(order.id, pickClientId);
      if (result.ok) {
        setLinkClientOpen(false);
        setPickClientId("");
      }
      return result;
    });
  }

  function applyWalletCredit(c: ClientCreditBalance) {
    if (c.serviceId) {
      setItemType("service");
      setCatalogId(c.serviceId);
    } else if (c.productId) {
      setItemType("product");
      setCatalogId(c.productId);
    }
    setUseCredit(true);
  }

  function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("orderId", order.id);
    formData.set("itemType", itemType);
    formData.set("catalogId", catalogId);
    if (willUseCredit) formData.set("usePackageCredit", "1");

    const pct = parsePct(formData.get("discountPercent"));
    if (pct > 0 && (itemType === "service" || itemType === "product")) {
      const coveredRaw = formData.get("coveredReais");
      const covered =
        willUseCredit && coveredRaw != null && String(coveredRaw).trim() !== ""
          ? Math.round(Number(String(coveredRaw).replace(",", ".")) * 100)
          : willUseCredit
            ? selectedCatalogPriceCents
            : 0;
      const base = willUseCredit
        ? Math.max(0, selectedCatalogPriceCents - Math.min(selectedCatalogPriceCents, covered))
        : selectedCatalogPriceCents;
      const discountCents = discountCentsFromPercent(base, pct);
      formData.set("discountReais", (discountCents / 100).toFixed(2));
    } else {
      formData.set("discountReais", "0");
    }

    run(async () => {
      const result = await addOrderItemAction(formData);
      if (result.ok) {
        form.reset();
        setCatalogId("");
        setItemType("service");
        setUseCredit(true);
        setItemDiscountPct("");
        setCoveredReais("");
      }
      return result;
    });
  }

  function handleDiscount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const pct = parsePct(formData.get("discountPercent"));
    const reais = discountCentsFromPercent(order.totalCents, pct) / 100;
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
            <strong>
              {formatMoney(order.discountCents)}
              {order.totalCents > 0 && order.discountCents > 0
                ? ` (${((order.discountCents / order.totalCents) * 100).toFixed(0)}%)`
                : ""}
            </strong>
          </div>
          <div className="client-stat">
            <span className="meta-label">Pago</span>
            <strong>{formatMoney(order.paidCents)}</strong>
          </div>
          {order.clientAccountDebtCents > 0 ? (
            <div className="client-stat">
              <span className="meta-label">Na conta</span>
              <strong>{formatMoney(order.clientAccountDebtCents)}</strong>
            </div>
          ) : null}
          <div className="client-stat">
            <span className="meta-label">Saldo</span>
            <strong>{formatMoney(order.balanceCents)}</strong>
          </div>
        </div>

        <p className="client-profile-hint">
          Aberta em {formatDateTimeSp(order.openedAt)}
          {order.closedAt ? ` · Fechada ${formatDateTimeSp(order.closedAt)}` : null}
        </p>

        {order.clientId && clientAccountCents != null && clientAccountCents !== 0 ? (
          <p
            className="order-wallet-warn"
            style={{
              marginBottom: 12,
              color:
                clientAccountCents > 0
                  ? "var(--success, #2e7d32)"
                  : "var(--danger, #c62828)",
            }}
          >
            Conta do cliente:{" "}
            <strong>
              {formatMoney(clientAccountCents)}
              {clientAccountCents > 0 ? " de crédito" : " em débito"}
            </strong>
            {clientAccountCents > 0
              ? " — use “Conta do cliente” no pagamento."
              : " — fiado em aberto."}
          </p>
        ) : null}

        {canEdit && order.clientId && !linkClientOpen ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 10 }}
            onClick={() => setLinkClientOpen(true)}
          >
            Trocar cliente
          </button>
        ) : null}

        {showClientLinker ? (
          <section className="order-client-link">
            <strong>{order.clientId ? "Trocar cliente" : "Vincular cliente"}</strong>
            <p className="client-profile-hint muted">
              {order.clientId
                ? "Só é possível trocar se não houver crédito usado ou venda de pacote na comanda."
                : "Necessário para vender pacote ou usar créditos da carteira."}
            </p>
            <ClientPicker
              value={pickClientId}
              onChange={(id) => setPickClientId(id)}
              required
            />
            <div className="order-client-link-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending || !pickClientId}
                onClick={linkClient}
              >
                {order.clientId ? "Confirmar troca" : "Vincular cliente"}
              </button>
              {order.clientId ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={pending}
                  onClick={() => {
                    setLinkClientOpen(false);
                    setPickClientId("");
                  }}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

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
                Cliente sem créditos. Em Tipo escolha Vender pacote → selecione o pacote.
              </p>
            ) : (
              <ul className="order-wallet-list">
                {[...creditsByPackage.values()].map((group) => (
                  <li key={group.clientPackageId} className="order-wallet-group">
                    <div className="order-wallet-group-head">
                      <strong>{group.packageName}</strong>
                      <em>
                        {group.lines.reduce((s, c) => s + c.remainingQty, 0)} rest.
                        {group.lines[0]?.expiresAt
                          ? ` · até ${formatDateTimeSp(group.lines[0].expiresAt).slice(0, 10)}`
                          : ""}
                      </em>
                    </div>
                    <ul className="order-wallet-credit-lines">
                      {group.lines.map((c) => (
                        <li key={c.creditId}>
                          <div>
                            <strong>{c.serviceName ?? c.productName ?? "Item"}</strong>
                            <span>{c.remainingQty} disponível(is)</span>
                          </div>
                          {canEdit && c.remainingQty > 0 ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={pending}
                              onClick={() => applyWalletCredit(c)}
                            >
                              Usar
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {canEdit ? (
                      <div className="order-wallet-line-actions">
                        {confirmTopUpId === group.clientPackageId ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={pending}
                              onClick={() => {
                                const id = group.clientPackageId;
                                setConfirmTopUpId(null);
                                run(() =>
                                  renewOrTopUpClientPackageAction({
                                    clientPackageId: id,
                                    mode: "topup",
                                    orderId: order.id,
                                  })
                                );
                              }}
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={pending}
                              onClick={() => setConfirmTopUpId(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={pending}
                            onClick={() => setConfirmTopUpId(group.clientPackageId)}
                          >
                            Repor
                          </button>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

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
                      <span className="order-badge is-credit">
                        {item.totalCents > 0 ? "Crédito + diferença" : "Crédito"}
                      </span>
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
                      ? item.totalCents > 0
                        ? ` · pacote cobre ${formatMoney(item.coveredCents)} · diferença ${formatMoney(item.totalCents)}`
                        : ` · tabela ${formatMoney(item.unitPriceCents)} abatida`
                      : item.discountCents > 0
                        ? ` · desconto ${formatMoney(item.discountCents)}`
                        : ""}
                  </span>
                </div>
                <div className="order-item-actions">
                  <strong
                    className={
                      item.redeemed && item.totalCents === 0 ? "is-zero" : undefined
                    }
                  >
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
                    const next = e.target.value as ItemType;
                    setItemType(next);
                    setCatalogId("");
                    if (next === "package" && !order.clientId) {
                      setLinkClientOpen(true);
                    }
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
                    ? `Abater 1 crédito (${selectedCreditQty} disponível${selectedCreditQty > 1 ? "s" : ""}). Ajuste a cobertura se sobrar diferença a cobrar.`
                    : `Cobrar avulso (há ${selectedCreditQty} crédito${selectedCreditQty > 1 ? "s" : ""} — marque para abater).`}
                </span>
              </label>
            ) : null}

            {willUseCredit && selectedCatalogPriceCents > 0 ? (
              <label className="form-field">
                <span>Cobertura do pacote (R$)</span>
                <input
                  key={`covered-${catalogId}`}
                  name="coveredReais"
                  type="number"
                  min={0}
                  step={0.01}
                  max={selectedCatalogPriceCents / 100}
                  value={
                    coveredReais === ""
                      ? (selectedCatalogPriceCents / 100).toFixed(2)
                      : coveredReais
                  }
                  onChange={(e) => setCoveredReais(e.target.value)}
                />
                <span className="client-profile-hint muted">
                  Quanto o crédito cobre. Tabela {formatMoney(selectedCatalogPriceCents)} —
                  se cobrir menos, a diferença entra a pagar (desconto % aplica no residual).
                </span>
              </label>
            ) : null}

            {itemType === "package" && packages.length === 0 ? (
              <p className="order-wallet-warn">
                Nenhum pacote vendável nesta lista. Corrija o vínculo em{" "}
                <a href="/pacotes">Cadastros → Pacotes</a>
                {" "}ou use <strong>Vender pacote</strong> naquela tela (cliente + Comprar).
              </p>
            ) : null}

            {itemType === "package" && packages.length > 0 ? (
              <p className="client-profile-hint muted">
                Atalho denso:{" "}
                <a href="/pacotes">Cadastros → Pacotes → Vender pacote</a>
                {" "}(cliente, pagamento e Comprar numa tela).
              </p>
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
            {itemType !== "package" ? (
              <label className="form-field">
                <span>Desconto no item (%)</span>
                <input
                  name="discountPercent"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={itemDiscountPct}
                  onChange={(e) => setItemDiscountPct(e.target.value)}
                  placeholder="0"
                />
                <span className="client-profile-hint muted">
                  {parsePct(itemDiscountPct) > 0
                    ? `= ${formatMoney(itemDiscountCentsPreview)} sobre ${formatMoney(itemDiscountBaseCents)}${
                        willUseCredit ? " (residual após abate)" : ""
                      }`
                    : willUseCredit
                      ? "Digite a % — o R$ é calculado no residual após o abate."
                      : "Digite a % — o R$ é calculado automaticamente sobre o preço."}
                </span>
              </label>
            ) : null}
            <button
              type="submit"
              className="btn btn-outline"
              disabled={pending || !catalogId || packageBlockedNoClient}
            >
              {itemType === "package"
                ? "+ Vender pacote / gerar carteira"
                : willUseCredit
                  ? "+ Lançar com crédito"
                  : "+ Adicionar item"}
            </button>
          </form>
        ) : null}

        {canEdit ? (
          <form className="form-stack" onSubmit={handleDiscount} style={{ marginTop: 12 }}>
            <label className="form-field">
              <span>Desconto da comanda (%)</span>
              <div className="form-row-2">
                <input
                  name="discountPercent"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={orderDiscountPct}
                  onChange={(e) => setOrderDiscountPct(e.target.value)}
                  placeholder="0"
                />
                <button type="submit" className="btn btn-outline" disabled={pending}>
                  Aplicar
                </button>
              </div>
              <span className="client-profile-hint muted">
                {parsePct(orderDiscountPct) > 0
                  ? `= ${formatMoney(orderDiscountCentsPreview)} sobre o subtotal ${formatMoney(order.totalCents)}`
                  : `Sobre o subtotal ${formatMoney(order.totalCents)}. Digite a % e Aplicar.`}
              </span>
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
            <PaymentMethodSelect
              name="method"
              required
              includeClientAccount={!hasPackageSale}
              defaultValue={
                clientCreditAvailable > 0 && !hasPackageSale ? "client_account" : "pix"
              }
            />
          </label>
          {clientCreditAvailable > 0 ? (
            <p className="client-profile-hint muted">
              Crédito disponível: {formatMoney(clientCreditAvailable)}. Pagamento via conta
              não entra no caixa.
            </p>
          ) : null}
          <label className="form-field">
            <span>Valor (R$) *</span>
            <input
              name="amountReais"
              type="number"
              min={0.01}
              step={0.01}
              required
              defaultValue={(
                Math.min(
                  order.balanceCents,
                  clientCreditAvailable > 0 && !hasPackageSale
                    ? clientCreditAvailable
                    : order.balanceCents
                ) / 100
              ).toFixed(2)}
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
            {order.clientId && order.balanceCents > 0 && !hasPackageSale ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending}
                title="Lança o restante na Conta do Cliente (crédito ou fiado) e fecha"
                onClick={() =>
                  run(async () => {
                    const result = await closeOrderToClientAccountAction(order.id);
                    if (result.ok) {
                      setPayCloseOpen(false);
                      onClose();
                    }
                    return result;
                  })
                }
              >
                {pending ? "…" : "Lançar na conta e fechar"}
              </button>
            ) : null}
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
            <PaymentMethodSelect
              name="method"
              required
              includeClientAccount={!hasPackageSale}
              defaultValue={
                clientCreditAvailable >= order.balanceCents && !hasPackageSale
                  ? "client_account"
                  : "pix"
              }
            />
          </label>
          {order.clientId ? (
            <p className="client-profile-hint muted">
              Sem receber agora? Use <strong>Lançar na conta e fechar</strong> — consome
              crédito existente ou deixa o restante como débito (fiado).
            </p>
          ) : null}
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
