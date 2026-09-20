"use server";

import { revalidatePath } from "next/cache";
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
import {
  renewOrTopUpClientPackage,
  sellCatalogPackageToClient,
} from "@/server/packages/mutations";

export async function createClientAction(formData: FormData): Promise<ActionResult> {
  return createClient({
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    howHeard: String(formData.get("howHeard") ?? ""),
    referredBy: String(formData.get("referredBy") ?? ""),
    campaign: String(formData.get("campaign") ?? ""),
    hairPreference: String(formData.get("hairPreference") ?? ""),
    avatarUrl: String(formData.get("avatarUrl") ?? ""),
    crmStatus: String(formData.get("crmStatus") ?? "client") || "client",
    marketingOptIn: formData.get("marketingOptIn") === "on" || formData.get("marketingOptIn") === "1",
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
    howHeard: String(formData.get("howHeard") ?? ""),
    referredBy: String(formData.get("referredBy") ?? ""),
    campaign: String(formData.get("campaign") ?? ""),
    hairPreference: String(formData.get("hairPreference") ?? ""),
    avatarUrl: String(formData.get("avatarUrl") ?? ""),
    crmStatus: String(formData.get("crmStatus") ?? "") || undefined,
    marketingOptIn: formData.get("marketingOptIn") === "on" || formData.get("marketingOptIn") === "1",
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

export async function renewOrTopUpClientPackageAction(input: {
  clientPackageId: string;
  mode: "topup" | "renew";
  orderId?: string;
  clientId?: string;
}) {
  const result = await renewOrTopUpClientPackage(input);
  if (result.ok) {
    revalidatePath("/clientes");
    revalidatePath("/comandas");
    if (input.clientId) revalidatePath(`/clientes?id=${input.clientId}`);
    if ("orderId" in result && result.orderId) {
      revalidatePath(`/comandas?id=${result.orderId}`);
    }
  }
  return result;
}

export async function sellCatalogPackageToClientAction(input: {
  clientId: string;
  packageId: string;
  staffId?: string;
}) {
  const result = await sellCatalogPackageToClient(input);
  if (result.ok) {
    revalidatePath("/clientes");
    revalidatePath("/comandas");
    revalidatePath(`/clientes?id=${input.clientId}`);
    if ("orderId" in result && result.orderId) {
      revalidatePath(`/comandas?id=${result.orderId}`);
    }
  }
  return result;
}

export async function postClientAccountAction(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { postClientAccountManual } = await import("@/server/clients/account");
  const clientId = String(formData.get("clientId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  if (kindRaw !== "credit" && kindRaw !== "debit") {
    return { ok: false, error: "Tipo de lançamento inválido" };
  }
  const kind = kindRaw;
  const amountReais = Number(String(formData.get("amountReais") ?? "").replace(",", "."));
  const result = await postClientAccountManual({
    clientId,
    kind,
    amountCents: Math.round(amountReais * 100),
    notes: String(formData.get("notes") ?? ""),
  });
  if (result.ok) {
    revalidatePath("/clientes");
    revalidatePath(`/clientes?id=${clientId}`);
    revalidatePath("/comandas");
  }
  return result;
}

export async function settleClientAccountDebtAction(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { settleClientAccountDebt } = await import("@/server/clients/account");
  const clientId = String(formData.get("clientId") ?? "");
  const method = String(formData.get("method") ?? "pix");
  const amountReais = Number(String(formData.get("amountReais") ?? "").replace(",", "."));
  const result = await settleClientAccountDebt({
    clientId,
    method,
    amountCents: Math.round(amountReais * 100),
    notes: String(formData.get("notes") ?? ""),
  });
  if (result.ok) {
    revalidatePath("/clientes");
    revalidatePath(`/clientes?id=${clientId}`);
    revalidatePath("/caixa");
    revalidatePath("/comandas");
  }
  return result;
}

export async function sendBirthdayMessageAction(clientId: string) {
  const { sendBirthdayMessage } = await import("@/server/clients/birthdays");
  const result = await sendBirthdayMessage(clientId);
  if (result.ok) {
    revalidatePath("/clientes/aniversariantes");
  }
  return result;
}
