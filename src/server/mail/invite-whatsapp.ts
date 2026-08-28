import { getConnectionForTenant } from "../agent/outbound";
import { normalizePhone } from "../clients/normalize";
import { sendTextMessage } from "../evolution/client";
import { digitsForEvolution } from "../evolution/phone";

type InviteWhatsAppInput = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  name: string;
  phone: string | null | undefined;
  email: string;
  tempPassword: string;
};

export async function sendMemberInviteWhatsApp(
  input: InviteWhatsAppInput
): Promise<{ sent: boolean; error?: string }> {
  const { phoneE164 } = normalizePhone(input.phone);
  if (!phoneE164) {
    return { sent: false, error: "Profissional sem celular válido no cadastro" };
  }

  const conn = await getConnectionForTenant(input.tenantId);
  if (!conn?.instanceName || conn.status !== "connected") {
    return { sent: false, error: "WhatsApp da unidade desconectado — pareie em Conversas" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const loginUrl = `${baseUrl}/login/${input.tenantSlug}`;
  const text =
    `Olá, ${input.name}! Seu acesso ao painel *${input.tenantName}* foi criado.\n\n` +
    `*Login:* ${input.email}\n` +
    `*Senha inicial:* ${input.tempPassword}\n\n` +
    `Entrar: ${loginUrl}\n\n` +
    `Troque a senha em Configurações → Minha conta após o primeiro acesso.`;

  try {
    await sendTextMessage(conn.instanceName, digitsForEvolution(phoneE164), text);
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Falha ao enviar WhatsApp",
    };
  }
}
