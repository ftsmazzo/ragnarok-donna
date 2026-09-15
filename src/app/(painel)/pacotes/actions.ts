"use server";

import { revalidatePath } from "next/cache";
import { completePackageSale } from "@/server/packages/mutations";

export async function completePackageSaleAction(input: {
  clientId: string;
  packageId: string;
  staffId?: string;
  notes?: string;
  method?: string;
  payAndClose?: boolean;
  amountCents?: number;
}) {
  const result = await completePackageSale(input);
  if (result.ok) {
    revalidatePath("/pacotes");
    revalidatePath("/clientes");
    revalidatePath("/comandas");
    revalidatePath(`/clientes?id=${input.clientId}`);
    if ("orderId" in result && result.orderId) {
      revalidatePath(`/comandas?id=${result.orderId}`);
    }
  }
  return result;
}
