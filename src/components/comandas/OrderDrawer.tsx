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
import { formatMoney, labelOrderStatus } from "@/lib/format";
import { labelStoredPayment } from "@/lib/payment-codes";
import {
  addOrderItemAction,
  addPaymentAction,
  cancelOrderAction,
  closeOrderAction,
  closeOrderToClientAccountAction,
  removePaymentAction,
  reopenOrderAction,
  removeOrderItemAction,
  setOrderClientAction,
  setOrderDiscountAction,
  setOrderItemCourtesyAction,
  settleAndCloseOrderAction,
  updateOrderItemLineAction,
  updatePaymentAmountAction,
} from "@/app/(painel)/comandas/actions";
import { renewOrTopUpClientPackageAction, cancelUnusedPackageSaleAction } from "@/app/(painel)/clientes/actions";
import { ClientPicker } from "@/components/agenda/ClientPicker";
import { PackageBookModal } from "@/components/comandas/PackageBookModal";
import { PackageVisitPlanner } from "@/components/comandas/PackageVisitPlanner";
import { PaymentMethodSelect } from "@/lib/paymentMethods";
import type { ClientCreditBalance } from "@/server/packages/credits";
import type { VisitServiceUnit } from "@/lib/package-visits";
import { useToast } from "@/components/ui/Toast";

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

type CheckoutLine = {
  key: string;
  method: string;
  amountReais: string;
  installments: string;
  cashReceived: string;
};

function makeCheckoutLine(amountCents: number, method = "pix"): CheckoutLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    amountReais: (Math.max(0, amountCents) / 100).toFixed(2),
    installments: "1",
    cashReceived: "",
  };
}

function parseReaisToCents(raw: string): number {
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

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
  const { showToast } = useToast();
  const [error, setError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payCloseOpen, setPayCloseOpen] = useState(false);
  const [payLines, setPayLines] = useState<CheckoutLine[]>(() => [makeCheckoutLine(0)]);
  const [insertInCash, setInsertInCash] = useState(() => !order.isStaffConsumption);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [itemType, setItemType] = useState<ItemType>("service");
  const [catalogId, setCatalogId] = useState("");
  const [useCredit, setUseCredit] = useState(true);
  const [itemDiscountPct, setItemDiscountPct] = useState("");
  const [itemCourtesy, setItemCourtesy] = useState(false);
  const [staffServiceConsumption, setStaffServiceConsumption] = useState(false);
  const [consumerStaffId, setConsumerStaffId] = useState("");
  const [lineStaffId, setLineStaffId] = useState(
    () => (order.isStaffConsumption && order.consumerStaffId) || ""
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTotalReais, setEditTotalReais] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPaymentReais, setEditPaymentReais] = useState("");
  const [coveredReais, setCoveredReais] = useState("");
  const [orderDiscountPct, setOrderDiscountPct] = useState(() =>
    orderDiscountPercent(order.totalCents, order.discountCents)
  );
  const [linkClientOpen, setLinkClientOpen] = useState(false);
  const [pickClientId, setPickClientId] = useState("");
  const [confirmTopUpId, setConfirmTopUpId] = useState<string | null>(null);
  const [bookTarget, setBookTarget] = useState<{
    serviceId: string;
    serviceName: string;
    durationMin: number;
  } | null>(null);
  const [visitPlanner, setVisitPlanner] = useState<{
    packageName: string;
    units: VisitServiceUnit[];
  } | null>(null);
  const [bookFlash, setBookFlash] = useState("");
  const [selectedClientPackageId, setSelectedClientPackageId] = useState("");
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
    if (order.isStaffConsumption) setInsertInCash(false);
  }, [order.id, order.isStaffConsumption]);

  useEffect(() => {
    if (order.isStaffConsumption && order.consumerStaffId) {
      setLineStaffId((prev) => prev || order.consumerStaffId || "");
    }
  }, [order.id, order.isStaffConsumption, order.consumerStaffId]);

  useEffect(() => {
    setOrderDiscountPct(orderDiscountPercent(order.totalCents, order.discountCents));
  }, [order.id, order.totalCents, order.discountCents]);

  useEffect(() => {
    setCoveredReais("");
    setItemDiscountPct("");
    setItemCourtesy(false);
    setStaffServiceConsumption(false);
    setConsumerStaffId("");
  }, [catalogId, itemType]);

  useEffect(() => {
    if (!payOpen && !payCloseOpen) return;
    // Só pré-seleciona Conta do Cliente quando o crédito cobre o saldo inteiro.
    // Crédito parcial + valor cheio fazia o Confirmar falhar “em silêncio” (erro atrás do modal).
    const defaultMethod =
      clientCreditAvailable >= order.balanceCents &&
      order.balanceCents > 0 &&
      !hasPackageSale
        ? "client_account"
        : "pix";
    setPayLines([makeCheckoutLine(order.balanceCents, defaultMethod)]);
    setInsertInCash(true);
  }, [payOpen, payCloseOpen, order.id, order.balanceCents, clientCreditAvailable, hasPackageSale]);

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

  const pendingPackageServices = order.items
    .filter((item) => item.packageSale && item.packageId)
    .flatMap((item) => {
      const pkg = packages.find((p) => p.id === item.packageId);
      if (!pkg?.items?.length) return [];
      return pkg.items
        .filter((line) => line.serviceId)
        .flatMap((line) =>
          Array.from({ length: Math.max(1, line.qty) }, () => ({
            packageId: item.packageId!,
            packageName: pkg.name,
            serviceId: line.serviceId!,
            serviceName: line.serviceName ?? "Serviço",
            walletPending: item.walletPending,
          }))
        );
    });

  function openBook(serviceId: string, serviceName: string) {
    const svc = services.find((s) => s.id === serviceId);
    setBookTarget({
      serviceId,
      serviceName,
      durationMin: svc?.durationMin ?? 30,
    });
    setBookFlash("");
  }

  function openVisitPlanner(group: {
    packageName: string;
    lines: typeof credits;
  }) {
    const units: VisitServiceUnit[] = [];
    for (const c of group.lines) {
      if (!c.serviceId || c.remainingQty <= 0) continue;
      const svc = services.find((s) => s.id === c.serviceId);
      const unit = {
        serviceId: c.serviceId,
        serviceName: c.serviceName ?? svc?.name ?? "Serviço",
        durationMin: svc?.durationMin ?? 30,
      };
      for (let i = 0; i < c.remainingQty; i += 1) units.push(unit);
    }
    if (units.length === 0) return;
    setVisitPlanner({ packageName: group.packageName, units });
    setBookFlash("");
  }

  const showClientLinker =
    canEdit && !order.isStaffConsumption && (!order.clientId || linkClientOpen);
  const packageBlockedNoClient =
    itemType === "package" && !order.clientId && !selectedPackage?.billAsLines;

  function run(fn: () => Promise<{ ok: boolean; error?: string } | null | undefined>) {
    setError("");
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result || !result.ok) {
          const msg = result?.error ?? "Erro";
          setError(msg);
          showToast(msg, "error");
          // Mesmo com falha reportada, o item pode ter sido gravado — atualiza a lista.
          onChanged();
          return;
        }
        onChanged();
      } catch (err) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "Falha ao processar. Tente de novo.";
        setError(msg);
        showToast(msg, "error");
        onChanged();
      }
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
    setSelectedClientPackageId(c.clientPackageId);
    setBookFlash(
      `Pacote selecionado: ${c.packageName} · ${c.serviceName ?? c.productName ?? "item"} — ${c.remainingQty} rest. de ${c.totalQty}. Escolha o profissional e lance o item para abater.`
    );
  }

  function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("orderId", order.id);
    formData.set("itemType", itemType);
    formData.set("catalogId", catalogId);
    if (lineStaffId) formData.set("staffId", lineStaffId);
    if (willUseCredit) formData.set("usePackageCredit", "1");
    if (willUseCredit && selectedClientPackageId) {
      formData.set("clientPackageId", selectedClientPackageId);
    }

    if (itemCourtesy && (itemType === "service" || itemType === "product")) {
      formData.set("courtesy", "1");
      formData.set("discountReais", "0");
    } else {
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
    }

    if (staffServiceConsumption && itemType === "service") {
      formData.set("staffServiceConsumption", "1");
      if (consumerStaffId) formData.set("consumerStaffId", consumerStaffId);
    }

    run(async () => {
      const result = await addOrderItemAction(formData);
      if (result?.ok) {
        setCatalogId("");
        setItemType("service");
        setUseCredit(true);
        setItemDiscountPct("");
        setItemCourtesy(false);
        setStaffServiceConsumption(false);
        setConsumerStaffId("");
        setCoveredReais("");
        setSelectedClientPackageId("");
        setBookFlash("");
        if (order.isStaffConsumption && order.consumerStaffId) {
          setLineStaffId(order.consumerStaffId);
        }
        showToast("Item adicionado", "success");
        setError("");
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

  function defaultPayMethod() {
    return clientCreditAvailable >= order.balanceCents &&
      order.balanceCents > 0 &&
      !hasPackageSale
      ? "client_account"
      : "pix";
  }

  function scrollCheckoutIntoView() {
    requestAnimationFrame(() => {
      const body = document.querySelector(".ui-drawer-body");
      if (body instanceof HTMLElement) {
        body.scrollTo({ top: 0, behavior: "smooth" });
      }
      const sheet = document.querySelector(".order-checkout-sheet");
      if (sheet instanceof HTMLElement) {
        sheet.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }

  function closeCheckout() {
    setPayOpen(false);
    setPayCloseOpen(false);
  }

  function openPayOnly() {
    if (order.balanceCents <= 0) {
      const msg =
        order.items.length === 0
          ? "Adicione itens antes de pagar."
          : "Nada a pagar — saldo já está zerado. Use Fechar comanda.";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    setPayLines([makeCheckoutLine(order.balanceCents, defaultPayMethod())]);
    setInsertInCash(true);
    setPayCloseOpen(false);
    setPayOpen(true);
    scrollCheckoutIntoView();
  }

  function openPayAndClose() {
    if (order.items.length === 0) {
      const msg = "Adicione ao menos um item antes de fechar.";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    if (order.balanceCents > 0) {
      setPayLines([makeCheckoutLine(order.balanceCents, defaultPayMethod())]);
      setInsertInCash(true);
    }
    setPayOpen(false);
    setPayCloseOpen(true);
    scrollCheckoutIntoView();
  }

  function submitPayOnly() {
    const line = payLines[0];
    if (!line) {
      const msg = "Informe a forma de pagamento";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    const amountCents = parseReaisToCents(line.amountReais);
    if (amountCents <= 0) {
      const msg = "Informe o valor do pagamento";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    if (!line.method) {
      const msg = "Escolha a forma de pagamento";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    const formData = new FormData();
    formData.set("orderId", order.id);
    formData.set("method", line.method);
    formData.set("amountReais", (amountCents / 100).toFixed(2));
    formData.set("insertInCash", insertInCash ? "1" : "0");
    if (line.method === "credit" && Number(line.installments) > 1) {
      formData.set("installments", line.installments);
    }
    run(async () => {
      const result = await addPaymentAction(formData);
      if (result.ok) {
        closeCheckout();
        const left = order.balanceCents - amountCents;
        if (left <= 1) {
          showToast("Pagamento ok — clique em Fechar comanda", "success");
        } else {
          showToast("Pagamento registrado", "success");
        }
      }
      return result;
    });
  }

  function submitPayAndClose() {
    if (order.balanceCents <= 0) {
      run(async () => {
        const closed = await closeOrderAction(order.id);
        if (closed.ok) {
          closeCheckout();
          onClose();
          showToast("Comanda fechada", "success");
        }
        return closed;
      });
      return;
    }
    if (Math.abs(payLinesDiffCents) > 1) {
      const msg =
        payLinesDiffCents < 0
          ? `Falta ${formatMoney(-payLinesDiffCents)} nas formas de pagamento`
          : `Formas somam ${formatMoney(payLinesDiffCents)} a mais que o saldo`;
      setError(msg);
      showToast(msg, "error");
      return;
    }
    const payments = payLines
      .map((line) => ({
        method: line.method,
        amountCents: parseReaisToCents(line.amountReais),
        installments:
          line.method === "credit" ? Number(line.installments) || undefined : undefined,
      }))
      .filter((p) => p.amountCents > 0 && p.method);
    if (payments.length === 0) {
      const msg = "Informe ao menos uma forma de pagamento";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    run(async () => {
      const closed = await settleAndCloseOrderAction({
        orderId: order.id,
        payments,
        insertInCash,
      });
      if (closed.ok) {
        closeCheckout();
        onClose();
        showToast("Comanda paga e fechada", "success");
      }
      return closed;
    });
  }

  function handlePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitPayOnly();
  }

  function updatePayLine(key: string, patch: Partial<CheckoutLine>) {
    setPayLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addPayLine() {
    const used = payLines.reduce((s, r) => s + parseReaisToCents(r.amountReais), 0);
    const left = Math.max(0, order.balanceCents - used);
    setPayLines((rows) => [...rows, makeCheckoutLine(left || 0, "pix")]);
  }

  function removePayLine(key: string) {
    setPayLines((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  const payLinesSumCents = payLines.reduce((s, r) => s + parseReaisToCents(r.amountReais), 0);
  const payLinesDiffCents = payLinesSumCents - order.balanceCents;
  const cashChangeCents = payLines.reduce((s, r) => {
    if (r.method !== "cash") return s;
    const received = parseReaisToCents(r.cashReceived);
    const applied = parseReaisToCents(r.amountReais);
    return s + Math.max(0, received - applied);
  }, 0);
  const anyNonAccount = payLines.some((r) => r.method !== "client_account");
  const checkoutMode = payOpen ? "pay" : payCloseOpen ? "payClose" : null;

  const catalog =
    itemType === "service" ? services : itemType === "product" ? products : packages;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={560}
        title={order.externalId ? `Comanda #${order.externalId}` : "Comanda"}
        subtitle={
          <>
            {order.isStaffConsumption ? (
              <>
                <span className="order-badge">Consumo</span>
                {" · "}
                {order.consumerStaffName ?? "Profissional"}
                {order.occurredOn ? ` · ${order.occurredOn}` : null}
              </>
            ) : (
              (order.clientName ?? "Sem cliente")
            )}
            {" · "}
            {order.status === "closed" ? (
              <span className="order-badge is-closed">{labelOrderStatus(order.status)}</span>
            ) : (
              labelOrderStatus(order.status)
            )}
          </>
        }
        footer={
          checkoutMode ? (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeCheckout}
                disabled={pending}
              >
                Voltar
              </button>
              {checkoutMode === "payClose" &&
              order.clientId &&
              !order.isStaffConsumption &&
              order.balanceCents > 0 &&
              !hasPackageSale ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pending}
                  title="Lança o restante na Conta do Cliente (crédito ou fiado) e fecha"
                  onClick={() =>
                    run(async () => {
                      const result = await closeOrderToClientAccountAction(order.id);
                      if (result.ok) {
                        closeCheckout();
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
                type="button"
                className={`btn btn-primary${pending ? " is-pending" : ""}`}
                disabled={
                  pending ||
                  (checkoutMode === "payClose" && Math.abs(payLinesDiffCents) > 1)
                }
                aria-busy={pending}
                title={
                  checkoutMode === "payClose" && Math.abs(payLinesDiffCents) > 1
                    ? payLinesDiffCents < 0
                      ? `Falta ${formatMoney(-payLinesDiffCents)} nas formas`
                      : `Formas somam ${formatMoney(payLinesDiffCents)} a mais`
                    : undefined
                }
                onClick={() => {
                  if (checkoutMode === "pay") submitPayOnly();
                  else submitPayAndClose();
                }}
              >
                {pending
                  ? checkoutMode === "pay"
                    ? "Confirmando…"
                    : "Fechando…"
                  : checkoutMode === "pay"
                    ? "Confirmar"
                    : "Confirmar e fechar"}
              </button>
            </>
          ) : (
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
                    disabled={pending}
                    onClick={openPayOnly}
                    title={
                      order.balanceCents <= 0
                        ? "Saldo zerado — nada a pagar"
                        : "Registrar pagamento parcial ou total"
                    }
                  >
                    Pagar
                  </button>
                  <button
                    type="button"
                    className={`btn btn-primary${pending ? " is-pending" : ""}`}
                    disabled={pending || order.items.length === 0}
                    aria-busy={pending}
                    onClick={() => {
                      if (order.balanceCents > 0) openPayAndClose();
                      else run(() => closeOrderAction(order.id));
                    }}
                    title="Paga o saldo (se houver) e fecha a comanda"
                  >
                    {pending
                      ? "Processando…"
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
          )
        }
      >
        {error ? <div className="form-error">{error}</div> : null}

        {checkoutMode ? (
          <div className="order-checkout-sheet">
            <h3 className="client-profile-heading">
              {checkoutMode === "pay" ? "Registrar pagamento" : "Pagar e fechar comanda"}
            </h3>
            {checkoutMode === "pay" ? (
              <form id="pay-form" className="form-stack" onSubmit={handlePayment}>
                <div className="checkout-summary">
                  <div>
                    <span>Total</span>
                    <strong>{formatMoney(due)}</strong>
                  </div>
                  <div>
                    <span>Já pago</span>
                    <strong>{formatMoney(order.paidCents)}</strong>
                  </div>
                  <div>
                    <span>A pagar</span>
                    <strong>{formatMoney(order.balanceCents)}</strong>
                  </div>
                  {cashChangeCents > 0 ? (
                    <div>
                      <span>Troco</span>
                      <strong>{formatMoney(cashChangeCents)}</strong>
                    </div>
                  ) : null}
                </div>

                {(payLines[0] ? [payLines[0]] : []).map((line) => (
                  <div key={line.key} className="checkout-pay-line">
                    <label className="form-field">
                      <span>Forma *</span>
                      <PaymentMethodSelect
                        value={line.method}
                        onChange={(v) => updatePayLine(line.key, { method: v })}
                        required
                        includeClientAccount={!hasPackageSale}
                      />
                    </label>
                    <label className="form-field">
                      <span>Valor (R$) *</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        required
                        value={line.amountReais}
                        onChange={(e) =>
                          updatePayLine(line.key, { amountReais: e.target.value })
                        }
                      />
                    </label>
                    {line.method === "credit" ? (
                      <label className="form-field">
                        <span>Parcelas</span>
                        <select
                          value={line.installments}
                          onChange={(e) =>
                            updatePayLine(line.key, { installments: e.target.value })
                          }
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={String(n)}>
                              {n}x
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {line.method === "cash" ? (
                      <label className="form-field">
                        <span>Recebido (R$)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.cashReceived}
                          onChange={(e) =>
                            updatePayLine(line.key, { cashReceived: e.target.value })
                          }
                          placeholder="opcional p/ troco"
                        />
                      </label>
                    ) : null}
                  </div>
                ))}

                {clientCreditAvailable > 0 ? (
                  <p className="client-profile-hint muted">
                    Crédito disponível: {formatMoney(clientCreditAvailable)}. Pagamento via
                    conta não entra no caixa.
                  </p>
                ) : null}

                {order.isStaffConsumption ? (
                  <p className="client-profile-hint muted">
                    Consumo de profissional <strong>não entra no caixa físico</strong> — o valor
                    ajusta comissão (50% no serviço + desconto na consumidora). Pode fechar o
                    caixa sem contar esse lançamento.
                  </p>
                ) : anyNonAccount ? (
                  <label className="form-field package-sale-checkbox">
                    <input
                      type="checkbox"
                      checked={insertInCash}
                      onChange={(e) => setInsertInCash(e.target.checked)}
                    />
                    <span>Inserir no Caixa?</span>
                  </label>
                ) : null}
              </form>
            ) : (
              <form
                id="pay-close-form"
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitPayAndClose();
                }}
              >
                <div className="checkout-summary">
                  <div>
                    <span>Total</span>
                    <strong>{formatMoney(due)}</strong>
                  </div>
                  <div>
                    <span>Já pago</span>
                    <strong>{formatMoney(order.paidCents)}</strong>
                  </div>
                  <div>
                    <span>A pagar</span>
                    <strong>{formatMoney(order.balanceCents)}</strong>
                  </div>
                  {cashChangeCents > 0 ? (
                    <div>
                      <span>Troco</span>
                      <strong>{formatMoney(cashChangeCents)}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="checkout-pay-lines">
                  <div className="checkout-pay-head">
                    <strong>+ Formas de pagamento</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={addPayLine}
                      disabled={pending}
                    >
                      + Forma
                    </button>
                  </div>
                  {payLines.map((line, idx) => (
                    <div key={line.key} className="checkout-pay-line">
                      <label className="form-field">
                        <span>Forma {idx + 1}</span>
                        <PaymentMethodSelect
                          value={line.method}
                          onChange={(v) => updatePayLine(line.key, { method: v })}
                          required
                          includeClientAccount={!hasPackageSale}
                        />
                      </label>
                      <label className="form-field">
                        <span>Valor (R$)</span>
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          required
                          value={line.amountReais}
                          onChange={(e) =>
                            updatePayLine(line.key, { amountReais: e.target.value })
                          }
                        />
                      </label>
                      {line.method === "credit" ? (
                        <label className="form-field">
                          <span>Parcelas</span>
                          <select
                            value={line.installments}
                            onChange={(e) =>
                              updatePayLine(line.key, { installments: e.target.value })
                            }
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={String(n)}>
                                {n}x
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {line.method === "cash" ? (
                        <label className="form-field">
                          <span>Recebido (R$)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={line.cashReceived}
                            onChange={(e) =>
                              updatePayLine(line.key, { cashReceived: e.target.value })
                            }
                            placeholder="opcional p/ troco"
                          />
                        </label>
                      ) : null}
                      {payLines.length > 1 ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => removePayLine(line.key)}
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <p className="client-profile-hint muted">
                  Formas: {formatMoney(payLinesSumCents)}
                  {Math.abs(payLinesDiffCents) <= 1
                    ? " · ok"
                    : payLinesDiffCents < 0
                      ? ` · falta ${formatMoney(-payLinesDiffCents)}`
                      : ` · sobra ${formatMoney(payLinesDiffCents)}`}
                </p>

                {order.isStaffConsumption ? (
                  <p className="client-profile-hint muted">
                    Consumo de profissional <strong>não entra no caixa físico</strong> — o valor
                    ajusta comissão (50% no serviço + desconto na consumidora). Pode fechar o
                    caixa sem contar esse lançamento.
                  </p>
                ) : anyNonAccount ? (
                  <label className="form-field package-sale-checkbox">
                    <input
                      type="checkbox"
                      checked={insertInCash}
                      onChange={(e) => setInsertInCash(e.target.checked)}
                    />
                    <span>Inserir no Caixa?</span>
                  </label>
                ) : null}

                {order.clientId ? (
                  <p className="client-profile-hint muted">
                    Sem receber agora? Use <strong>Lançar na conta e fechar</strong> — consome
                    crédito existente ou deixa o restante como débito (fiado).
                  </p>
                ) : null}
              </form>
            )}
          </div>
        ) : (
          <>
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

        {canEdit && order.clientId && !order.isStaffConsumption && !linkClientOpen ? (
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

        {order.series.length > 0 ? (
          <section className="order-wallet">
            <div className="order-wallet-head">
              <strong>Agenda recorrente</strong>
              <span>{order.series.length} horário(s)</span>
            </div>
            <ul className="series-result">
              {order.series.map((s) => (
                <li key={s.id} className={s.status === "no_show" || s.status === "cancelled" ? "bad" : "ok"}>
                  {formatDateTimeSp(new Date(s.startsAt))} ·{" "}
                  {s.status === "no_show" ? "não veio" : s.status === "cancelled" ? "cancelado" : "na agenda"}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {order.clientId && !order.isStaffConsumption ? (
          <section className="order-wallet">
            <div className="order-wallet-head">
              <strong>Carteira de pacotes</strong>
              <span>
                {credits.length > 0
                  ? `${credits.reduce((s, c) => s + c.remainingQty, 0)} rest. de ${credits.reduce((s, c) => s + c.totalQty, 0)}`
                  : "Sem créditos"}
              </span>
            </div>
            {bookFlash ? <p className="client-profile-hint">{bookFlash}</p> : null}
            {credits.length === 0 ? (
              <p className="order-wallet-empty">
                Cliente sem créditos. Em Tipo escolha Vender pacote → selecione o pacote.
              </p>
            ) : (
              <ul className="order-wallet-list">
                {[...creditsByPackage.values()].map((group) => {
                  const rest = group.lines.reduce((s, c) => s + c.remainingQty, 0);
                  const total = group.lines.reduce((s, c) => s + c.totalQty, 0);
                  const named = group.packageName.trim().match(/^(\d+)\b/);
                  const mismatch = named != null && Number(named[1]) !== total;
                  return (
                  <li
                    key={group.clientPackageId}
                    className={
                      selectedClientPackageId === group.clientPackageId
                        ? "order-wallet-group is-selected"
                        : "order-wallet-group"
                    }
                  >
                    <div className="order-wallet-group-head">
                      <strong>{group.packageName}</strong>
                      <em>
                        {rest} rest. de {total}
                        {group.lines[0]?.expiresAt
                          ? ` · até ${formatDateTimeSp(group.lines[0].expiresAt).slice(0, 10)}`
                          : ""}
                        {selectedClientPackageId === group.clientPackageId
                          ? " · em uso"
                          : ""}
                      </em>
                    </div>
                    {canEdit && rest > 0 && order.clientId ? (
                      <div className="order-wallet-line-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pending}
                          onClick={() => openVisitPlanner(group)}
                        >
                          Planejar visitas
                        </button>
                      </div>
                    ) : null}
                    {mismatch ? (
                      <p className="form-error">
                        O nome diz {named?.[1]}, mas o catálogo creditou {total}. O saldo é {rest} de {total}, não o número do nome.
                      </p>
                    ) : null}
                    <ul className="order-wallet-credit-lines">
                      {group.lines.map((c) => (
                        <li key={c.creditId}>
                          <div>
                            <strong>{c.serviceName ?? c.productName ?? "Item"}</strong>
                            <span>
                              {c.remainingQty} rest. de {c.totalQty}
                            </span>
                          </div>
                          {canEdit && c.remainingQty > 0 ? (
                            <div className="order-wallet-credit-actions">
                              {c.serviceId && order.clientId ? (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  disabled={pending}
                                  onClick={() =>
                                    openBook(c.serviceId!, c.serviceName ?? "Serviço")
                                  }
                                >
                                  Agendar
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={pending}
                                onClick={() => applyWalletCredit(c)}
                              >
                                Usar ({c.remainingQty})
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {permissions.canWrite && rest === total && rest > 0 ? (
                      <div className="order-wallet-line-actions">
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={pending}
                          title="Excluir venda e estornar do caixa"
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Excluir esta venda de pacote?\nOs créditos saem da carteira e o valor some do Caixa do dia."
                              )
                            ) {
                              return;
                            }
                            run(() =>
                              cancelUnusedPackageSaleAction({
                                clientPackageId: group.clientPackageId,
                              })
                            );
                          }}
                        >
                          🗑 Excluir venda
                        </button>
                      </div>
                    ) : null}
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
                  );
                })}
              </ul>
            )}
            {pendingPackageServices.length > 0 && order.clientId ? (
              <div className="order-package-book">
                <p className="client-profile-hint">
                  Serviços deste pacote — use <strong>Planejar visitas</strong> na carteira após
                  liberar créditos, ou agende um serviço avulso abaixo.
                </p>
                {bookFlash ? <p className="client-profile-hint">{bookFlash}</p> : null}
                <ul className="order-wallet-credit-lines">
                  {pendingPackageServices.map((line, idx) => (
                    <li key={`${line.packageId}-${line.serviceId}-${idx}`}>
                      <div>
                        <strong>{line.serviceName}</strong>
                        <span>{line.packageName}</span>
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={pending}
                          onClick={() => openBook(line.serviceId, line.serviceName)}
                        >
                          Agendar
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
                    {item.courtesy ? (
                      <span className="order-badge is-courtesy">Cortesia</span>
                    ) : null}
                    {item.staffServiceConsumption ? (
                      <span className="order-badge">Consumo 50%</span>
                    ) : null}
                  </strong>
                  <span className="muted">
                    {item.qty}x · {item.staffName ?? "Sem profissional"}
                    {item.commissionCents != null && item.commissionCents > 0
                      ? ` · comissão${
                          item.commissionBps != null
                            ? ` ${(item.commissionBps / 100).toFixed(
                                item.commissionBps % 100 === 0 ? 0 : 1
                              )}%`
                            : ""
                        } ${formatMoney(item.commissionCents)}`
                      : item.commissionBps != null && item.commissionBps > 0
                        ? ` · comissão ${(item.commissionBps / 100).toFixed(
                            item.commissionBps % 100 === 0 ? 0 : 1
                          )}%`
                        : ""}
                    {item.redeemed
                      ? item.totalCents > 0
                        ? ` · pacote cobre ${formatMoney(item.coveredCents)} · diferença ${formatMoney(item.totalCents)}`
                        : ` · tabela ${formatMoney(item.unitPriceCents)} abatida`
                      : item.courtesy
                        ? ` · tabela ${formatMoney(item.unitPriceCents * item.qty)} zerada`
                        : item.discountCents > 0
                          ? ` · desconto ${formatMoney(item.discountCents)}`
                          : ""}
                  </span>
                  {canEdit &&
                  !item.packageSale &&
                  !item.redeemed &&
                  (item.itemType === "service" || item.itemType === "product") ? (
                    <label className="form-check order-item-courtesy">
                      <input
                        type="checkbox"
                        checked={item.courtesy}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            setOrderItemCourtesyAction(
                              item.id,
                              order.id,
                              e.target.checked
                            )
                          )
                        }
                      />
                      <span>Cortesia</span>
                    </label>
                  ) : null}
                  {canEdit &&
                  !item.packageSale &&
                  !item.redeemed &&
                  !item.courtesy &&
                  (item.itemType === "service" || item.itemType === "product") ? (
                    editingItemId === item.id ? (
                      <div className="form-row-2" style={{ alignItems: "center", gap: 8, marginTop: 6 }}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editTotalReais}
                          onChange={(e) => setEditTotalReais(e.target.value)}
                          aria-label="Valor cobrado (R$)"
                          style={{ maxWidth: 110 }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pending}
                          onClick={() => {
                            const totalReais = Number(String(editTotalReais).replace(",", "."));
                            if (!Number.isFinite(totalReais) || totalReais < 0) {
                              showToast("Informe um valor válido", "error");
                              return;
                            }
                            run(async () => {
                              const result = await updateOrderItemLineAction(
                                item.id,
                                order.id,
                                { totalReais }
                              );
                              if (result.ok) {
                                setEditingItemId(null);
                                showToast("Valor atualizado", "success");
                              }
                              return result;
                            });
                          }}
                        >
                          Ok
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => setEditingItemId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={pending}
                        style={{ marginTop: 4 }}
                        title="Altera o valor cobrado deste item"
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditTotalReais((item.totalCents / 100).toFixed(2));
                        }}
                      >
                        Editar valor
                      </button>
                    )
                  ) : null}
                </div>
                <div className="order-item-actions">
                  <strong
                    className={
                      (item.redeemed || item.courtesy) && item.totalCents === 0
                        ? "is-zero"
                        : undefined
                    }
                  >
                    {formatMoney(item.totalCents)}
                  </strong>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const result = await removeOrderItemAction(item.id, order.id);
                          if (result?.ok) {
                            showToast("Item removido", "success");
                            setError("");
                          }
                          return result;
                        })
                      }
                    >
                      Remover
                    </button>
                  ) : item.packageSale && permissions.canWrite ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      title="Excluir venda e estornar do caixa"
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Excluir esta venda de pacote?\nOs créditos saem da carteira e o valor some do Caixa do dia."
                          )
                        ) {
                          return;
                        }
                        run(() =>
                          cancelUnusedPackageSaleAction({ orderItemId: item.id })
                        );
                      }}
                    >
                      🗑
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form className="form-stack order-add-item" onSubmit={handleAddItem}>
            {itemType === "service" ? (
              <p className="client-profile-hint muted">
                {order.isStaffConsumption
                  ? "Consumo de profissional: serviço a 50% (comissão na executora, desconto na consumidora), sem card na agenda e sem entrar no caixa."
                  : "Serviço na comanda aparece na agenda do profissional escolhido (comissão). Produto não entra na agenda."}
              </p>
            ) : null}
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
                  {!order.isStaffConsumption ? (
                    <option value="package">Vender pacote</option>
                  ) : null}
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
            !order.isStaffConsumption &&
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

            {itemType === "package" && selectedPackage?.billAsLines ? (
              <p className="client-profile-hint">
                Entra uma linha por serviço, já com o valor dividido. A secretária não altera preço. Fora dos dias do pacote, use os serviços avulsos.
              </p>
            ) : itemType === "package" ? (
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
              <span>Profissional {itemType === "service" || selectedPackage?.billAsLines ? "*" : ""}</span>
              <select
                name="staffId"
                value={lineStaffId}
                onChange={(e) => setLineStaffId(e.target.value)}
                required={itemType === "service" || Boolean(selectedPackage?.billAsLines)}
              >
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
              <>
                <label className="form-field">
                  <span>Desconto no item (%)</span>
                  <div className="form-row-2" style={{ alignItems: "center", gap: 8 }}>
                    <input
                      name="discountPercent"
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={itemCourtesy ? "100" : itemDiscountPct}
                      onChange={(e) => setItemDiscountPct(e.target.value)}
                      placeholder="0"
                      disabled={itemCourtesy}
                    />
                    {!itemCourtesy ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        title="Aplica 50% de desconto no item"
                        onClick={() => setItemDiscountPct("50")}
                      >
                        50%
                      </button>
                    ) : null}
                  </div>
                  <span className="client-profile-hint muted">
                    {itemCourtesy
                      ? `Cortesia: item sai a ${formatMoney(0)} (tabela ${formatMoney(itemDiscountBaseCents)}).`
                      : parsePct(itemDiscountPct) > 0
                        ? `= ${formatMoney(itemDiscountCentsPreview)} sobre ${formatMoney(itemDiscountBaseCents)}${
                            willUseCredit ? " (residual após abate)" : ""
                          }`
                        : willUseCredit
                          ? "Digite a % — o R$ é calculado no residual após o abate."
                          : "Digite a % — o R$ é calculado automaticamente sobre o preço."}
                  </span>
                </label>
                <label
                  className={
                    itemCourtesy
                      ? "form-check order-courtesy-toggle is-on"
                      : "form-check order-courtesy-toggle"
                  }
                >
                  <input
                    type="checkbox"
                    checked={itemCourtesy}
                    disabled={willUseCredit || staffServiceConsumption}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setItemCourtesy(on);
                      if (on) {
                        setItemDiscountPct("100");
                        setUseCredit(false);
                        setStaffServiceConsumption(false);
                      } else {
                        setItemDiscountPct("");
                      }
                    }}
                  />
                  <span>
                    {willUseCredit
                      ? "Desmarque o crédito de pacote para marcar cortesia."
                      : "Cortesia — zera o valor deste item (não entra no caixa)."}
                  </span>
                </label>
                {itemType === "service" && !order.isStaffConsumption ? (
                  <>
                    <label
                      className={
                        staffServiceConsumption
                          ? "form-check order-courtesy-toggle is-on"
                          : "form-check order-courtesy-toggle"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={staffServiceConsumption}
                        disabled={willUseCredit || itemCourtesy}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setStaffServiceConsumption(on);
                          if (on) {
                            setItemDiscountPct("50");
                            setUseCredit(false);
                            setItemCourtesy(false);
                          } else if (itemDiscountPct === "50") {
                            setItemDiscountPct("");
                          }
                        }}
                      />
                      <span>
                        Consumo profissional (50%) — quem executou ganha comissão sobre o valor
                        reduzido; desconto na consumidora.
                      </span>
                    </label>
                    {staffServiceConsumption ? (
                      <label className="form-field">
                        <span>Quem consumiu (desconto na comissão)</span>
                        <select
                          value={consumerStaffId}
                          onChange={(e) => setConsumerStaffId(e.target.value)}
                        >
                          <option value="">— opcional —</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            <button
              type="submit"
              className="btn btn-outline"
              disabled={pending || !catalogId || packageBlockedNoClient}
            >
              {itemType === "package"
                ? selectedPackage?.billAsLines
                  ? "+ Adicionar já dividido"
                  : "+ Vender pacote / gerar carteira"
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
                  <strong>{labelStoredPayment(p.method, p.meta)}</strong>
                  <span className="muted">{formatDateTimeSp(p.paidAt)}</span>
                  {canEdit && editingPaymentId === p.id ? (
                    <div className="form-row-2" style={{ alignItems: "center", gap: 8, marginTop: 6 }}>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={editPaymentReais}
                        onChange={(e) => setEditPaymentReais(e.target.value)}
                        aria-label="Valor pago (R$)"
                        style={{ maxWidth: 110 }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={pending}
                        onClick={() => {
                          const amountReais = Number(String(editPaymentReais).replace(",", "."));
                          if (!Number.isFinite(amountReais) || amountReais <= 0) {
                            showToast("Informe um valor válido", "error");
                            return;
                          }
                          run(async () => {
                            const result = await updatePaymentAmountAction(p.id, amountReais);
                            if (result.ok) {
                              setEditingPaymentId(null);
                              showToast("Valor pago atualizado", "success");
                            }
                            return result;
                          });
                        }}
                      >
                        Ok
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => setEditingPaymentId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="order-item-actions">
                  <strong>{formatMoney(p.amountCents)}</strong>
                  {canEdit && editingPaymentId !== p.id ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        title="Alterar valor pago"
                        onClick={() => {
                          setEditingPaymentId(p.id);
                          setEditPaymentReais((p.amountCents / 100).toFixed(2));
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        title="Remover para trocar a forma de pagamento"
                        onClick={() =>
                          run(async () => {
                            const result = await removePaymentAction(p.id);
                            if (result.ok) {
                              showToast("Pagamento removido — escolha outra forma", "success");
                            }
                            return result;
                          })
                        }
                      >
                        Remover
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit && order.balanceCents <= 0 && order.items.length > 0 ? (
          <p className="client-profile-hint">
            Saldo zerado. Use <strong>Fechar comanda</strong> para concluir — ou remova um
            pagamento acima se precisar trocar a forma.
          </p>
        ) : null}

        <p className="client-profile-hint muted">
          Total: {formatMoney(due)} · Já pago: {formatMoney(order.paidCents)} · Saldo:{" "}
          {formatMoney(order.balanceCents)}
        </p>
          </>
        )}
      </Drawer>

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

      {bookTarget && order.clientId ? (
        <PackageBookModal
          open
          orderId={order.id}
          clientId={order.clientId}
          serviceId={bookTarget.serviceId}
          serviceName={bookTarget.serviceName}
          durationMin={bookTarget.durationMin}
          staff={staff}
          onClose={() => setBookTarget(null)}
          onSaved={() => {
            setBookFlash(`Agendado: ${bookTarget.serviceName}`);
            onChanged();
          }}
        />
      ) : null}

      {visitPlanner && order.clientId ? (
        <PackageVisitPlanner
          open
          orderId={order.id}
          clientId={order.clientId}
          packageName={visitPlanner.packageName}
          units={visitPlanner.units}
          staff={staff}
          onClose={() => setVisitPlanner(null)}
          onSaved={(count) => {
            setBookFlash(
              count === 1
                ? "1 visita agendada na agenda"
                : `${count} visitas agendadas na agenda`
            );
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
