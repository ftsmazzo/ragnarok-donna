"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/context/tenant";
import { isManagementRole } from "@/server/permissions/roles";
import { spawnDonnaImport } from "@/server/tenant/donna-import";

export async function triggerDonnaImportAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await requireSession();
  if (session.tenant.slug !== "donna-elegant") {
    return { ok: false, error: "Disponível apenas para Donna Elegant." };
  }
  if (!isManagementRole(session.role)) {
    return { ok: false, error: "Sem permissão para importar dados." };
  }

  const result = spawnDonnaImport();
  revalidatePath("/inicio");
  revalidatePath("/clientes");
  revalidatePath("/agenda");
  return result;
}
