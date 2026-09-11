"use server";

import { escalateSupportHuman, returnSupportToAi, sendSupportMessage } from "@/server/support/mutations";
import { getOrCreateSupportThread } from "@/server/support/queries";

export async function loadSupportThreadAction() {
  try {
    const thread = await getOrCreateSupportThread();
    return { ok: true as const, thread };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    return { ok: false as const, error: msg === "FORBIDDEN" ? "Sem permissão" : msg };
  }
}

export async function sendSupportMessageAction(body: string) {
  return sendSupportMessage({ body });
}

export async function escalateSupportAction(reason?: string) {
  return escalateSupportHuman({ reason });
}

export async function returnSupportToAiAction() {
  return returnSupportToAi();
}
