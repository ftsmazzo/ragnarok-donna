"use server";

import { revalidatePath } from "next/cache";
import {
  clearAgentInbox,
  returnToAi,
  seedDemoConversation,
  sendHumanMessage,
  takeHandoff,
} from "@/server/agent/mutations";
import { syncInboxFromEvolution } from "@/server/agent/sync-inbox";

export {
  startWhatsAppPairingAction,
  refreshWhatsAppPairingAction,
  linkWhatsAppInstanceAction,
  updateWhatsAppProfilePictureAction,
  updateWhatsAppProfileNameAction,
} from "@/app/(painel)/configuracoes/agente/whatsapp-actions";

function revalidateConversas(id?: string) {
  revalidatePath("/conversas");
  if (id) revalidatePath(`/conversas?id=${id}`);
}

export async function syncInboxFromEvolutionAction() {
  const result = await syncInboxFromEvolution();
  if (result.ok) revalidateConversas();
  return result;
}

export async function takeHandoffAction(conversationId: string) {
  const result = await takeHandoff(conversationId);
  if (result.ok) revalidateConversas(conversationId);
  return result;
}

export async function returnToAiAction(conversationId: string) {
  const result = await returnToAi(conversationId);
  if (result.ok) revalidateConversas(conversationId);
  return result;
}

export async function sendHumanMessageAction(conversationId: string, body: string) {
  const result = await sendHumanMessage(conversationId, body);
  if (result.ok) revalidateConversas(conversationId);
  return result;
}

export async function seedDemoConversationAction() {
  const result = await seedDemoConversation();
  if (result.ok) revalidateConversas(result.id);
  return result;
}

export async function clearAgentInboxAction() {
  const result = await clearAgentInbox();
  if (result.ok) revalidateConversas();
  return result;
}
