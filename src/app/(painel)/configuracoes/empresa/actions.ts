"use server";

import { revalidatePath } from "next/cache";
import { saveEmpresaForm, type EmpresaFormInput } from "@/server/tenant/empresa";

export async function saveEmpresaAction(input: EmpresaFormInput) {
  const result = await saveEmpresaForm(input);
  if (result.ok) {
    revalidatePath("/configuracoes/empresa");
    revalidatePath("/inicio");
    revalidatePath("/configuracoes/agente");
  }
  return result;
}
