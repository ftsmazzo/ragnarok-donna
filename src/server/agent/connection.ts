import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  connectInstance,
  createBaileysInstance,
  extractQrBase64,
  fetchInstances,
  getConnectionState,
  mapConnectionStatus,
  setInstanceWebhook,
} from "@/server/evolution/client";
import { getAgentWebhookUrl } from "@/server/evolution/config";
import { phoneFromJid } from "@/server/evolution/phone";
import { requireCapability } from "../permissions/guards";
import { requireSession, requireTenantContext } from "../context/tenant";

export type WhatsAppConnectionView = {
  instanceName: string;
  status: string;
  phoneE164: string | null;
  qrcodeBase64: string | null;
  webhookConfigured: boolean;
};

async function assertCanManage() {
  const session = await requireSession();
  requireCapability(session, "conversations.write");
  return session;
}

export async function getWhatsAppConnection(): Promise<WhatsAppConnectionView | null> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.tenantId, tenant.id))
    .limit(1);

  if (!row) {
    return {
      instanceName: tenant.slug,
      status: "disconnected",
      phoneE164: null,
      qrcodeBase64: null,
      webhookConfigured: false,
    };
  }

  return {
    instanceName: row.instanceName,
    status: row.status,
    phoneE164: row.phoneE164,
    qrcodeBase64: null,
    webhookConfigured: Boolean(row.meta?.webhookUrl),
  };
}

async function upsertConnection(input: {
  tenantId: string;
  instanceName: string;
  status: string;
  phoneE164?: string | null;
  webhookUrl?: string;
}) {
  const db = createDb();
  const [existing] = await db
    .select({ id: schema.whatsappConnections.id, meta: schema.whatsappConnections.meta })
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.tenantId, input.tenantId))
    .limit(1);

  const meta = {
    ...(existing?.meta ?? {}),
    ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
  };

  if (existing) {
    await db
      .update(schema.whatsappConnections)
      .set({
        instanceName: input.instanceName,
        status: input.status,
        phoneE164: input.phoneE164 ?? undefined,
        meta,
        updatedAt: new Date(),
      })
      .where(eq(schema.whatsappConnections.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(schema.whatsappConnections)
    .values({
      tenantId: input.tenantId,
      instanceName: input.instanceName,
      status: input.status,
      phoneE164: input.phoneE164 ?? null,
      meta,
    })
    .returning({ id: schema.whatsappConnections.id });
  return row.id;
}

export async function syncWhatsAppConnectionByInstance(instanceName: string) {
  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.instanceName, instanceName))
    .limit(1);
  if (!row) return null;

  let status = row.status;
  let phoneE164 = row.phoneE164;

  try {
    const state = await getConnectionState(instanceName);
    const rawState = state.instance?.state ?? state.state ?? state.status ?? state.instance?.status;
    status = mapConnectionStatus(rawState);

    const instances = await fetchInstances();
    const inst = instances.find(
      (i) =>
        i.instance?.instanceName === instanceName ||
        i.instanceName === instanceName ||
        i.name === instanceName
    );
    const owner = inst?.owner ?? inst?.ownerJid ?? inst?.number ?? inst?.instance?.owner;
    if (owner) {
      phoneE164 = phoneFromJid(owner.includes("@") ? owner : `${owner}@s.whatsapp.net`);
    }
  } catch {
    // Evolution indisponível — mantém último status conhecido
  }

  await db
    .update(schema.whatsappConnections)
    .set({
      status,
      phoneE164: phoneE164 ?? row.phoneE164,
      updatedAt: new Date(),
    })
    .where(eq(schema.whatsappConnections.id, row.id));

  return { tenantId: row.tenantId, status, phoneE164 };
}

/** Cria instância Evolution, configura webhook e retorna QR para parear. */
export async function startWhatsAppPairing(): Promise<
  { ok: true; data: WhatsAppConnectionView } | { ok: false; error: string }
> {
  try {
    await assertCanManage();
    const tenant = await requireTenantContext();
    const instanceName = tenant.slug.replace(/[^a-z0-9-_]/gi, "_").slice(0, 80);
    const webhookUrl = getAgentWebhookUrl();

    await createBaileysInstance(instanceName);
    await setInstanceWebhook(instanceName, webhookUrl);

    const connect = await connectInstance(instanceName);
    const qrcodeBase64 = extractQrBase64(connect);
    const status = mapConnectionStatus(connect.instance?.status ?? "connecting");

    await upsertConnection({
      tenantId: tenant.id,
      instanceName,
      status,
      webhookUrl,
    });

    return {
      ok: true,
      data: {
        instanceName,
        status,
        phoneE164: null,
        qrcodeBase64,
        webhookConfigured: true,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao iniciar pareamento",
    };
  }
}

/** Atualiza status (e QR se ainda conectando). */
export async function refreshWhatsAppPairing(): Promise<
  { ok: true; data: WhatsAppConnectionView } | { ok: false; error: string }
> {
  try {
    await assertCanManage();
    const tenant = await requireTenantContext();
    const db = createDb();
    const [row] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenant.id))
      .limit(1);

    const instanceName = row?.instanceName ?? tenant.slug;
    let qrcodeBase64: string | null = null;

    const synced = await syncWhatsAppConnectionByInstance(instanceName);
    const status = synced?.status ?? row?.status ?? "disconnected";
    const phoneE164 = synced?.phoneE164 ?? row?.phoneE164 ?? null;

    if (status !== "connected") {
      try {
        const connect = await connectInstance(instanceName);
        qrcodeBase64 = extractQrBase64(connect);
      } catch {
        // QR expirado ou instância já aberta
      }
    }

    return {
      ok: true,
      data: {
        instanceName,
        status,
        phoneE164,
        qrcodeBase64,
        webhookConfigured: Boolean(row?.meta?.webhookUrl),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao atualizar conexão",
    };
  }
}

export async function resolveTenantByInstance(instanceName: string) {
  const db = createDb();
  const [row] = await db
    .select({
      tenantId: schema.whatsappConnections.tenantId,
      instanceName: schema.whatsappConnections.instanceName,
      status: schema.whatsappConnections.status,
    })
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.instanceName, instanceName))
    .limit(1);
  return row ?? null;
}
