"use server";

import {
  createClient,
  deactivateClient,
  reactivateClient,
  updateClient,
  type ActionResult,
} from "@/server/clients/mutations";

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
