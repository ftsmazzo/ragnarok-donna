"use server";

import { revalidatePath } from "next/cache";
import {
  addCashMovement,
  closeCashSession,
  deleteCashMovement,
  excludePaymentFromCash,
  openCashSession,
} from "@/server/finance/mutations";
import { cancelUnusedPackageSale } from "@/server/packages/mutations";

function revalidateCash() {
  revalidatePath("/caixa");
  revalidatePath("/comandas");
}

export async function openCashSessionAction(formData: FormData) {
  const openingReais = Number(String(formData.get("openingReais") ?? "0").replace(",", "."));
  const result = await openCashSession({
    openingCents: Math.round((Number.isFinite(openingReais) ? openingReais : 0) * 100),
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  if (result.ok) revalidateCash();
  return result;
}

export async function closeCashSessionAction(formData: FormData) {
  const closingReais = Number(String(formData.get("closingReais") ?? "").replace(",", "."));
  const result = await closeCashSession({
    closingCents: Math.round(closingReais * 100),
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  if (result.ok) revalidateCash();
  return result;
}

export async function addCashMovementAction(formData: FormData) {
  const direction = String(formData.get("direction") ?? "") as "in" | "out";
  const amountReais = Number(String(formData.get("amountReais") ?? "").replace(",", "."));
  const result = await addCashMovement({
    direction,
    amountCents: Math.round(amountReais * 100),
    method: String(formData.get("method") ?? "") || undefined,
    description: String(formData.get("description") ?? "") || undefined,
  });
  if (result.ok) revalidateCash();
  return result;
}

export async function deleteCashMovementAction(movementId: string) {
  const result = await deleteCashMovement(movementId);
  if (result.ok) revalidateCash();
  return result;
}

/**
 * Lixeira no Detalhe: pacote sem uso cancela venda;
 * demais → só tira do caixa (comanda fechada ok; não mexe comissão/consumo).
 */
export async function deleteCashDayPaymentAction(input: {
  paymentId: string;
  packageCancel?: boolean;
}): Promise<{ ok: boolean; error?: string; refundedCents?: number }> {
  const paymentId = input.paymentId?.trim();
  if (!paymentId) return { ok: false, error: "Pagamento inválido" };

  if (input.packageCancel) {
    const result = await cancelUnusedPackageSale({ paymentId });
    if (result.ok) revalidateCash();
    return result;
  }

  const result = await excludePaymentFromCash(paymentId);
  if (result.ok) revalidateCash();
  return result;
}
