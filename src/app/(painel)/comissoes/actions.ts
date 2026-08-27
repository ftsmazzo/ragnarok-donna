"use server";

import { revalidatePath } from "next/cache";
import { createStaffAdvance, type AdvanceKind } from "@/server/commissions";

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
