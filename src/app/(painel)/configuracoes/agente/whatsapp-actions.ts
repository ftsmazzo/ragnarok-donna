"use server";

import { revalidatePath } from "next/cache";
import {
  linkWhatsAppInstance,
  refreshWhatsAppPairing,
  replaceWhatsAppInstance,
  startWhatsAppPairing,
  updateWhatsAppProfileName,
  updateWhatsAppProfilePicture,
} from "@/server/agent/connection";

function revalidateWa() {
  revalidatePath("/configuracoes/agente");
  revalidatePath("/conversas");
}

export async function startWhatsAppPairingAction(instanceName?: string) {
  const result = await startWhatsAppPairing(instanceName);
  if (result.ok) revalidateWa();
  return result;
}

export async function replaceWhatsAppInstanceAction(instanceName: string) {
  const result = await replaceWhatsAppInstance(instanceName);
  if (result.ok) revalidateWa();
  return result;
}

export async function refreshWhatsAppPairingAction() {
  const result = await refreshWhatsAppPairing();
  if (result.ok) revalidateWa();
  return result;
}

export async function linkWhatsAppInstanceAction(instanceName: string) {
  const result = await linkWhatsAppInstance(instanceName);
  if (result.ok) revalidateWa();
  return result;
}

export async function updateWhatsAppProfilePictureAction(picture: string) {
  const result = await updateWhatsAppProfilePicture(picture);
  if (result.ok) revalidateWa();
  return result;
}

export async function updateWhatsAppProfileNameAction(name: string) {
  const result = await updateWhatsAppProfileName(name);
  if (result.ok) revalidateWa();
  return result;
}
