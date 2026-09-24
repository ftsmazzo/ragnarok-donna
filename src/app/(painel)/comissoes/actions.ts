"use server";

import { revalidatePath } from "next/cache";
import {
  createStaffAdvance,
  recalcCommissionsCatalogAction,
  type AdvanceKind,
} from "@/server/commissions";
import { registerStaffProductConsumption } from "@/server/staff-consumption/mutations";

export async function createAdvanceAction(formData: FormData) {
  const kind = String(formData.get("kind") ?? "vale") as AdvanceKind;
  const amountReais = Number(String(formData.get("amountReais") ?? "").replace(",", "."));
  const result = await createStaffAdvance({
    staffId: String(formData.get("staffId") ?? ""),
    kind,
    amountCents: Math.round(amountReais * 100),
    notes: String(formData.get("notes") ?? "") || undefined,
    linkCashOut: String(formData.get("linkCashOut") ?? "") === "1",
  });
  if (result.ok) {
    revalidatePath("/comissoes");
    revalidatePath("/caixa");
    revalidatePath("/relatorios/fluxo");
  }
  return result;
}

export async function registerStaffConsumptionAction(formData: FormData) {
  const qtyRaw = Number(formData.get("qty") ?? 1);
  const result = await registerStaffProductConsumption({
    staffId: String(formData.get("staffId") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    qty: Number.isFinite(qtyRaw) ? qtyRaw : 1,
  });
  if (result.ok) {
    revalidatePath("/comissoes");
    revalidatePath("/produtos");
    revalidatePath("/relatorios/estoque");
  }
  return result;
}

export async function recalcCommissionsAction(input: { from: string; to: string }) {
  const result = await recalcCommissionsCatalogAction(input);
  if (result.ok) {
    revalidatePath("/comissoes");
  }
  return result;
}
