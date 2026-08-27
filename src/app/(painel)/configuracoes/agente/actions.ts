"use server";

import { revalidatePath } from "next/cache";
import { saveAgentConfig, type SaveAgentConfigInput } from "@/server/agent/agent-config";

export async function saveAgentConfigAction(input: SaveAgentConfigInput) {
  const result = await saveAgentConfig(input);
  if (result.ok) {
    revalidatePath("/configuracoes/agente");
  }
  return result;
}
