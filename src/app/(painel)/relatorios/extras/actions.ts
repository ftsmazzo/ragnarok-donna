"use server";

import { revalidatePath } from "next/cache";
import { upsertStaffExtrasGoal } from "@/server/insights/extras-ranking";

export async function saveExtrasGoalAction(input: {
  staffId: string;
  amountReais: string;
  qty?: string;
}) {
  const amount = Number(String(input.amountReais ?? "").replace(",", "."));
  if (!Number.isFinite(amount)) {
    return { ok: false as const, error: "Informe a meta em reais" };
  }
  const qtyRaw = input.qty?.trim();
  const qty = qtyRaw ? Number(qtyRaw) : null;
  if (qtyRaw && !Number.isFinite(qty)) {
    return { ok: false as const, error: "Quantidade inválida" };
  }

  const result = await upsertStaffExtrasGoal({
    staffId: input.staffId,
    monthlyTargetCents: Math.round(amount * 100),
    monthlyTargetQty: qty,
  });

  if (result.ok) {
    revalidatePath("/relatorios/extras");
    revalidatePath("/alertas");
  }
  return result;
}
