import { getConnectionForTenant } from "./outbound";
import { getHandoffNotifyPhoneE164 } from "./agent-config";
import { digitsForEvolution } from "@/server/evolution/phone";
import { sendTextMessage } from "@/server/evolution/client";

/**
 * Avisa a equipe no WhatsApp configurado quando o cliente pede humano.
 * Usa a instância Evolution do tenant → número de alerta do perfil.
 * Não grava na thread do cliente (é aviso interno).
 */
export async function notifyHandoffRequest(input: {
  tenantId: string;
  conversationId: string;
  clientPhoneE164: string | null;
  clientName?: string | null;
}): Promise<{ ok: true; notified: boolean } | { ok: false; error: string; notified: false }> {
  const notifyPhone = await getHandoffNotifyPhoneE164(input.tenantId);
  if (!notifyPhone) {
    return { ok: true, notified: false };
  }

  const conn = await getConnectionForTenant(input.tenantId);
  if (!conn?.instanceName || conn.status !== "connected") {
    return {
      ok: false,
      error: "WhatsApp da unidade desconectado — alerta de handoff não enviado",
      notified: false,
    };
  }

  const who = input.clientName?.trim() || "Cliente";
  const phoneLabel = input.clientPhoneE164 ?? "sem telefone";
  const text =
    `🔔 Atendimento humano\n` +
    `${who} pediu falar com a equipe.\n` +
    `Tel: ${phoneLabel}\n` +
    `Abra Conversas IA no painel para assumir.`;

  try {
    await sendTextMessage(conn.instanceName, digitsForEvolution(notifyPhone), text);
    return { ok: true, notified: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao notificar handoff",
      notified: false,
    };
  }
}
