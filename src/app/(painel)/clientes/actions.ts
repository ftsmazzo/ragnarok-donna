"use server";

import {
  createClient,
  deactivateClient,
  reactivateClient,
  updateClient,
  type ActionResult,
} from "@/server/clients/mutations";
import {
  getClient,
  getClientProfile,
  type ClientDetail,
  type ClientProfile,
} from "@/server/clients/queries";

export async function createClientAction(formData: FormData): Promise<ActionResult> {
  return createClient({
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
  });
}

export async function updateClientAction(
  clientId: string,
  formData: FormData
): Promise<ActionResult> {
  return updateClient(clientId, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
  });
}

export async function deactivateClientAction(clientId: string): Promise<ActionResult> {
  return deactivateClient(clientId);
}

export async function reactivateClientAction(clientId: string): Promise<ActionResult> {
  return reactivateClient(clientId);
}

/** Abre ficha sem sair da tela atual (ex.: Conversas). */
export async function getClientFichaAction(
  clientId: string
): Promise<
  { ok: true; client: ClientDetail; profile: ClientProfile } | { ok: false; error: string }
> {
  try {
    const [client, profile] = await Promise.all([getClient(clientId), getClientProfile(clientId)]);
    return { ok: true, client, profile };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Não foi possível abrir a ficha",
    };
  }
}
