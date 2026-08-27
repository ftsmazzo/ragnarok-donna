import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { setInstanceWebhook } from "@/server/evolution/client";
import { getAgentWebhookUrl } from "@/server/evolution/config";
import { requireCapability } from "../permissions/guards";
import { requireSession, requireTenantContext } from "../context/tenant";
import { syncRecentInboundFromEvolution } from "./inbound";

/** Importa últimas msgs da Evolution para a inbox (sem reenviar resposta). */
export async function syncInboxFromEvolution(): Promise<
  { ok: true; imported: number; skipped: number; scanned: number } | { ok: false; error: string }
> {
  try {
    const session = await requireSession();
    requireCapability(session, "conversations.write");
    const tenant = await requireTenantContext();
    const db = createDb();
    const [row] = await db
      .select({ instanceName: schema.whatsappConnections.instanceName })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenant.id))
      .limit(1);

    if (!row?.instanceName) {
      return { ok: false, error: "WhatsApp ainda não conectado" };
    }

    try {
      await setInstanceWebhook(row.instanceName, getAgentWebhookUrl());
    } catch {
      // ignore
    }

    const result = await syncRecentInboundFromEvolution(row.instanceName, 50);
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao sincronizar mensagens",
    };
  }
}
