"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { buildFollowUpDraft } from "@/lib/followup";
import { normalizePhone } from "@/server/clients/normalize";
import { requireSession, requireTenantContext } from "@/server/context/tenant";
import { deliverWhatsAppText, getConnectionForTenant } from "@/server/agent/outbound";
import type { FollowUpRow } from "@/server/insights/types";

export async function sendFollowUpWhatsAppAction(
  row: FollowUpRow
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSession();
    const tenant = await requireTenantContext();
    const { phoneE164 } = normalizePhone(row.phone);
    if (!phoneE164) return { ok: false, error: "Cliente sem telefone válido" };

    const conn = await getConnectionForTenant(tenant.id);
    if (!conn?.instanceName || conn.status !== "connected") {
      return { ok: false, error: "WhatsApp da unidade desconectado — pareie em Conversas" };
    }

    const draft = buildFollowUpDraft(row, tenant.name);
    const db = createDb();
    let [conv] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.tenantId, tenant.id),
          eq(schema.conversations.phoneE164, phoneE164)
        )
      )
      .limit(1);

    if (!conv) {
      const [created] = await db
        .insert(schema.conversations)
        .values({
          tenantId: tenant.id,
          phoneE164,
          clientId: row.clientId,
          mode: "ai",
        })
        .returning({ id: schema.conversations.id });
      conv = created;
    }

    const sent = await deliverWhatsAppText({
      tenantId: tenant.id,
      instanceName: conn.instanceName,
      phoneE164,
      text: draft,
      conversationId: conv.id,
      direction: "outbound_human",
    });

    if (!sent.ok) return { ok: false, error: sent.error };
    revalidatePath("/conversas");
    revalidatePath("/relatorios/perfil");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao enviar WhatsApp",
    };
  }
}
