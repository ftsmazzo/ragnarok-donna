"use server";

import { escalateSupportHuman, returnSupportToAi, sendSupportMessage } from "@/server/support/mutations";
import { getOrCreateSupportThread } from "@/server/support/queries";
import { publicSupportError } from "@/server/support/reliability";

export async function loadSupportThreadAction() {
  try {
    const thread = await getOrCreateSupportThread();
    return { ok: true as const, thread };
  } catch (err) {
    return {
      ok: false as const,
      error: publicSupportError(err, "Não foi possível abrir o suporte"),
    };
  }
}

export async function sendSupportMessageAction(body: string, requestId: string) {
  return sendSupportMessage({ body, requestId });
}

export async function escalateSupportAction(reason?: string) {
  return escalateSupportHuman({ reason });
}

export async function returnSupportToAiAction() {
  return returnSupportToAi();
}
