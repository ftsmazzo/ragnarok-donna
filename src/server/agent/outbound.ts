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

  try {
    const res = await sendTextMessage(
      input.instanceName,
      digitsForEvolution(input.phoneE164),
      input.text
    );
    waMessageId = res.key?.id;
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
