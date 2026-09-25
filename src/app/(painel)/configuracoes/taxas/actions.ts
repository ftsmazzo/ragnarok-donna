"use server";

import { revalidatePath } from "next/cache";
import {
  resetPaymentFeesForm,
  savePaymentFeesForm,
} from "@/server/tenant/payment-fees";
import type { PaymentFeesTable } from "@/lib/payment-fees";

export async function savePaymentFeesAction(input: PaymentFeesTable) {
  const result = await savePaymentFeesForm(input);
  if (result.ok) {
    revalidatePath("/configuracoes/taxas");
    revalidatePath("/caixa");
  }
  return result;
}

export async function resetPaymentFeesAction() {
  const result = await resetPaymentFeesForm();
  if (result.ok) {
    revalidatePath("/configuracoes/taxas");
    revalidatePath("/caixa");
  }
  return result;
}
