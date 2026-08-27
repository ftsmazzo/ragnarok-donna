"use server";

import { revalidatePath } from "next/cache";
import {
  addCashMovement,
  closeCashSession,
  openCashSession,
} from "@/server/finance/mutations";

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
