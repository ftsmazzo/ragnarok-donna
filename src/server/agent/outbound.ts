import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { digitsForEvolution } from "@/server/evolution/phone";
import { sendTextMessage } from "@/server/evolution/client";

export async function getConnectionForTenant(tenantId: string) {
  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

/**
 * Preferência de destino:
 * 1) remoteJidLid (@lid) — Baileys com tctoken costuma entregar melhor
 * 2) telefone E.164 em dígitos
 */
function resolveSendNumber(
  phoneE164: string,
  meta: Record<string, unknown> | null | undefined
): string {
  const lid = typeof meta?.remoteJidLid === "string" ? meta.remoteJidLid : null;
  if (lid && lid.includes("@lid")) return lid;
  return digitsForEvolution(phoneE164);
}

export async function deliverWhatsAppText(input: {
  tenantId: string;
  instanceName: string;
  phoneE164: string;
  text: string;
  conversationId: string;
  direction: "outbound_ai" | "outbound_human";
  operatorUserId?: string | null;
}): Promise<{ ok: true; messageId: string; waMessageId?: string } | { ok: false; error: string }> {
  const db = createDb();
  const now = new Date();
  let waMessageId: string | undefined;

  const [conv] = await db
    .select({ meta: schema.conversations.meta })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, input.conversationId))
    .limit(1);

  const number = resolveSendNumber(input.phoneE164, conv?.meta);

  try {
    const res = await sendTextMessage(input.instanceName, number, input.text);
    waMessageId = res.key?.id;
    const status = (res as { status?: string }).status;
    if (status && String(status).toUpperCase() === "PENDING") {
      console.warn(
        "[outbound] Evolution retornou PENDING — Baileys/tctoken pode estar sem patch:",
        number
      );
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Evolution sendText falhou",
    };
  }

  const [msg] = await db
    .insert(schema.messages)
    .values({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: input.direction,
      body: input.text,
      waMessageId: waMessageId ?? null,
      operatorUserId: input.operatorUserId ?? null,
    })
    .returning({ id: schema.messages.id });

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(schema.conversations.id, input.conversationId));

  return { ok: true, messageId: msg.id, waMessageId };
}
