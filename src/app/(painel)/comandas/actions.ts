"use server";

import { revalidatePath } from "next/cache";
import {
  addOrderItem,
  addPayment,
  cancelOrder,
  closeOrder,
  closeOrderToClientAccount,
  openOrder,
  payAndCloseOrder,
  reopenOrder,
  removeOrderItem,
  setOrderClient,
  setOrderDiscount,
  setOrderItemCourtesy,
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

export async function listRecurrencePackagesAction(appointmentId: string) {
  const { listRecurrencePackagesForAppointment } = await import(
    "@/server/orders/mutations"
  );
  return listRecurrencePackagesForAppointment(appointmentId);
}

export async function applyRecurrencePackageAction(
  appointmentId: string,
  clientPackageId: string
) {
  const { applyRecurrencePackageFromAppointment } = await import(
    "@/server/orders/mutations"
  );
  const result = await applyRecurrencePackageFromAppointment({
    appointmentId,
    clientPackageId,
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
  const clientPackageId = String(formData.get("clientPackageId") ?? "") || undefined;
  const coveredRaw = formData.get("coveredReais");
  const coveredCents =
    coveredRaw != null && String(coveredRaw).trim() !== ""
      ? Math.round(Number(String(coveredRaw).replace(",", ".")) * 100)
      : undefined;
  const courtesy =
    String(formData.get("courtesy") ?? "") === "1" ||
    String(formData.get("courtesy") ?? "") === "on";
  const result = await addOrderItem({
    orderId,
    itemType,
    catalogId: String(formData.get("catalogId") ?? ""),
    staffId: String(formData.get("staffId") ?? "") || undefined,
    qty: Number(formData.get("qty") || 1),
    discountCents: Math.round(Number(formData.get("discountReais") || 0) * 100),
    coveredCents,
    usePackageCredit,
    clientPackageId,
    courtesy,
  });
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function removeOrderItemAction(itemId: string, orderId: string) {
  const result = await removeOrderItem(itemId);
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function setOrderItemCourtesyAction(
  itemId: string,
  orderId: string,
  courtesy: boolean
) {
  const result = await setOrderItemCourtesy(itemId, courtesy);
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function addPaymentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const amountReais = Number(String(formData.get("amountReais") ?? "").replace(",", "."));
  const insertRaw = String(formData.get("insertInCash") ?? "1");
  const insertInCash = insertRaw === "1" || insertRaw === "on" || insertRaw === "true";
  const installments = Number(formData.get("installments") || 0);
  const meta =
    installments > 1
      ? { installments: Math.min(24, Math.max(2, Math.round(installments))) }
      : undefined;
  const result = await addPayment({
    orderId,
    method: String(formData.get("method") ?? ""),
    amountCents: Math.round(amountReais * 100),
    insertInCash,
    meta,
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

export async function reopenOrderAction(orderId: string) {
  const result = await reopenOrder(orderId);
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function payAndCloseOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const insertRaw = String(formData.get("insertInCash") ?? "1");
  const insertInCash = insertRaw === "1" || insertRaw === "on" || insertRaw === "true";
  const installments = Number(formData.get("installments") || 0);
  const meta =
    installments > 1
      ? { installments: Math.min(24, Math.max(2, Math.round(installments))) }
      : undefined;
  const result = await payAndCloseOrder({
    orderId,
    method: String(formData.get("method") ?? "pix"),
    insertInCash,
    meta,
  });
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function closeOrderToClientAccountAction(orderId: string) {
  const result = await closeOrderToClientAccount(orderId);
  if (result.ok) {
    revalidateOrders(orderId);
    revalidatePath("/clientes");
  }
  return result;
}

export async function cancelOrderAction(orderId: string) {
  const result = await cancelOrder(orderId);
  if (result.ok) revalidateOrders(orderId);
  return result;
}

export async function setOrderClientAction(orderId: string, clientId: string) {
  const result = await setOrderClient({ orderId, clientId });
  if (result.ok) revalidateOrders(orderId);
  return result;
}

/** Agenda um serviço do pacote sem sair da comanda. */
export async function scheduleFromOrderAction(input: {
  orderId: string;
  clientId: string;
  serviceId: string;
  staffId: string;
  date: string;
  hour: number;
  minute: number;
  durationMin?: number;
}) {
  const { scheduleAppointment } = await import("@/server/agenda/mutations");
  const result = await scheduleAppointment({
    staffId: input.staffId,
    date: input.date,
    hour: input.hour,
    minute: input.minute,
    durationMin: input.durationMin ?? 30,
    clientId: input.clientId,
    serviceId: input.serviceId,
    notes: `Comanda ${input.orderId.slice(0, 8)}`,
  });
  if (result.ok) {
    revalidateOrders(input.orderId);
    revalidatePath("/agenda");
    revalidatePath(`/agenda?date=${input.date}`);
  }
  return result;
}

/** Agenda N visitas do pacote (cada visita pode juntar vários serviços). */
export async function schedulePackageVisitsAction(input: {
  orderId: string;
  clientId: string;
  visits: Array<{
    staffId: string;
    date: string;
    hour: number;
    minute: number;
    serviceIds: string[];
    primaryServiceId: string;
    durationMin: number;
    visitLabel: string;
  }>;
}): Promise<{ ok: boolean; error?: string; created?: number }> {
  if (!input.visits.length) {
    return { ok: false, error: "Nenhuma visita para agendar" };
  }
  const { scheduleAppointment } = await import("@/server/agenda/mutations");
  let created = 0;
  const dates = new Set<string>();

  for (const visit of input.visits) {
    if (!visit.staffId || !visit.date || !visit.primaryServiceId) {
      return {
        ok: false,
        error: "Visita incompleta (profissional, data ou serviço)",
        created,
      };
    }
    if (!visit.serviceIds.length) {
      return { ok: false, error: "Visita sem serviços", created };
    }
    const result = await scheduleAppointment({
      staffId: visit.staffId,
      date: visit.date,
      hour: visit.hour,
      minute: visit.minute,
      durationMin: Math.max(5, visit.durationMin || 30),
      clientId: input.clientId,
      serviceId: visit.primaryServiceId,
      notes: `Pacote · ${visit.visitLabel} · comanda ${input.orderId.slice(0, 8)}`,
      extraMeta: {
        visitLabel: visit.visitLabel,
        packageServiceIds: visit.serviceIds,
        fromOrderId: input.orderId,
      },
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Falha ao agendar visita",
        created,
      };
    }
    created += 1;
    dates.add(visit.date);
  }

  revalidateOrders(input.orderId);
  revalidatePath("/agenda");
  for (const d of dates) revalidatePath(`/agenda?date=${d}`);
  return { ok: true, created };
}
