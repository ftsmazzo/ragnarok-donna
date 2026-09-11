"use server";

import { revalidatePath } from "next/cache";
import {
  addOrderItem,
  addPayment,
  cancelOrder,
  closeOrder,
  openOrder,
  payAndCloseOrder,
  removeOrderItem,
  setOrderDiscount,
} from "@/server/orders/mutations";

function revalidateOrders(id?: string) {
  revalidatePath("/comandas");
  revalidatePath("/comandas/historico");
  revalidatePath("/caixa");
  if (id) revalidatePath(`/comandas?id=${id}`);
}

export async function openOrderAction(formData: FormData) {
  const result = await openOrder({
    clientId: String(formData.get("clientId") ?? "") || undefined,
    appointmentId: String(formData.get("appointmentId") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  if (result.ok) revalidateOrders(result.id);
  return result;
}

export async function openOrderFromAppointmentAction(appointmentId: string, clientId?: string) {
  const result = await openOrder({
    appointmentId,
    clientId: clientId || undefined,
  });
  if (result.ok) {
    revalidateOrders(result.id);
    revalidatePath("/agenda");
  }
  return result;
}

export async function addOrderItemAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const itemTypeRaw = String(formData.get("itemType") ?? "service");
  const itemType =
    itemTypeRaw === "product"
      ? "product"
      : itemTypeRaw === "package"
        ? "package"
        : "service";
  const usePackageCredit =
    String(formData.get("usePackageCredit") ?? "") === "1" ||
    String(formData.get("usePackageCredit") ?? "") === "on";
  const result = await addOrderItem({
    orderId,
    itemType,
    catalogId: String(formData.get("catalogId") ?? ""),
    staffId: String(formData.get("staffId") ?? "") || undefined,
    qty: Number(formData.get("qty") || 1),
    discountCents: Math.round(Number(formData.get("discountReais") || 0) * 100),
    usePackageCredit,
  });
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function removeOrderItemAction(itemId: string, orderId: string) {
  const result = await removeOrderItem(itemId);
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function addPaymentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const amountReais = Number(String(formData.get("amountReais") ?? "").replace(",", "."));
  const result = await addPayment({
    orderId,
    method: String(formData.get("method") ?? ""),
    amountCents: Math.round(amountReais * 100),
  });
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function setOrderDiscountAction(orderId: string, discountReais: number) {
  const result = await setOrderDiscount(orderId, Math.round(discountReais * 100));
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function closeOrderAction(orderId: string) {
  const result = await closeOrder(orderId);
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function payAndCloseOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const result = await payAndCloseOrder({
    orderId,
    method: String(formData.get("method") ?? "pix"),
  });
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function cancelOrderAction(orderId: string) {
  const result = await cancelOrder(orderId);
  if (result.ok) revalidateOrders(orderId);
  return result;
}
