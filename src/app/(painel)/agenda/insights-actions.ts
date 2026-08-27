"use server";

import { getClientUpsellTips } from "@/server/insights";

export async function getClientUpsellTipsAction(clientId: string) {
  if (!clientId) return [];
  return getClientUpsellTips(clientId);
}
