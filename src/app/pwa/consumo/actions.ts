"use server";

import { revalidatePath } from "next/cache";
import { addOrderItem } from "@/server/orders/mutations";
import { registerStaffProductConsumption } from "@/server/staff-consumption/mutations";

function revalidateConsumo(orderId?: string) {
  revalidatePath("/pwa/consumo");
  revalidatePath("/comandas");
  revalidatePath("/comissoes");
  revalidatePath("/produtos");
  if (orderId) revalidatePath(`/comandas?id=${orderId}`);
}

export async function addSaleProductAction(orderId: string, productId: string, qty = 1) {
  const result = await addOrderItem({
    orderId,
    itemType: "product",
    catalogId: productId,
    qty,
  });
  if (result.ok) revalidateConsumo(orderId);
  return result;
}

export async function registerMyConsumptionAction(productId: string, qty = 1) {
  const result = await registerStaffProductConsumption({ productId, qty });
  if (result.ok) revalidateConsumo();
  return result;
}
