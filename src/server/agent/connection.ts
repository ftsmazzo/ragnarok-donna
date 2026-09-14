import { and, eq, ne } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  connectInstance,
  createBaileysInstance,
  deleteInstance,
  extractQrBase64,
  fetchInstances,
  getConnectionState,
  logoutInstance,
  mapConnectionStatus,
  setInstanceWebhook,
  updateProfileName,
  updateProfilePicture,
  type EvolutionInstance,
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
  profilePicUrl: string | null;
  profileName: string | null;
  /** Instâncias Evolution ainda sem tenant no app (p/ vincular Ragnarok). */
  availableInstances: string[];
  /** Nome sugerido ao criar (slug do tenant). */
  suggestedInstanceName: string;
  /** Nome de perfil WA sugerido (o que o cliente vê). */
  suggestedProfileName: string;
};

function suggestedNameForSlug(slug: string) {
  return slug.replace(/[^a-z0-9-_]/gi, "_").slice(0, 80) || "tenant";
}

function suggestedProfileNameForSlug(slug: string) {
  if (/ragnarok/i.test(slug)) return "Sara | Ragnarok";
  return "Donna";
}

function normalizeInstanceName(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function pickInstanceMeta(inst: EvolutionInstance | undefined) {
  if (!inst) return { phoneE164: null as string | null, profilePicUrl: null as string | null, profileName: null as string | null };
  const owner =
    inst.owner ?? inst.ownerJid ?? inst.number ?? inst.instance?.owner ?? null;
  const phoneE164 = owner
    ? phoneFromJid(owner.includes("@") ? owner : `${owner}@s.whatsapp.net`)
    : null;
  const any = inst as EvolutionInstance & {
    profilePicUrl?: string;
    profilePictureUrl?: string;
    profileName?: string;
    instance?: { profilePicUrl?: string; profilePictureUrl?: string; profileName?: string };
  };
  const profilePicUrl =
    any.profilePicUrl ??
    any.profilePictureUrl ??
    any.instance?.profilePicUrl ??
    any.instance?.profilePictureUrl ??
    null;
  const profileName = any.profileName ?? any.instance?.profileName ?? null;
  return { phoneE164, profilePicUrl, profileName };
}

function instanceNamesFromEvolution(list: EvolutionInstance[]): string[] {
  return list
    .map((i) => i.instance?.instanceName ?? i.instanceName ?? i.name ?? "")
    .filter(Boolean);
}

async function assertCanManage() {
  const session = await requireSession();
  requireCapability(session, "conversations.write");
  return session;
}

async function listUnlinkedInstanceNames(excludeTenantId?: string): Promise<string[]> {
  const db = createDb();
  let linked: { instanceName: string }[] = [];
  try {
    linked = await db
      .select({ instanceName: schema.whatsappConnections.instanceName })
      .from(schema.whatsappConnections);
  } catch {
    linked = [];
  }
  const linkedSet = new Set(linked.map((r) => r.instanceName));

  // Se o tenant atual já tem uma, ainda listamos as outras
  if (excludeTenantId) {
    const [mine] = await db
      .select({ instanceName: schema.whatsappConnections.instanceName })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, excludeTenantId))
      .limit(1);
    if (mine) linkedSet.delete(mine.instanceName);
  }

  try {
    const remote = await fetchInstances();
    return instanceNamesFromEvolution(remote).filter((n) => !linkedSet.has(n));
  } catch {
    return [];
  }
}

async function upsertConnection(input: {
  tenantId: string;
  instanceName: string;
  status: string;
  phoneE164?: string | null;
  webhookUrl?: string;
  profilePicUrl?: string | null;
  profileName?: string | null;
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
    ...(input.profilePicUrl !== undefined ? { profilePicUrl: input.profilePicUrl } : {}),
    ...(input.profileName !== undefined ? { profileName: input.profileName } : {}),
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

function viewFromParts(input: {
  instanceName: string;
  status: string;
  phoneE164: string | null;
  qrcodeBase64?: string | null;
  webhookConfigured: boolean;
  profilePicUrl?: string | null;
  profileName?: string | null;
  availableInstances: string[];
  suggestedInstanceName: string;
  suggestedProfileName: string;
}): WhatsAppConnectionView {
  return {
    instanceName: input.instanceName,
    status: input.status,
    phoneE164: input.phoneE164,
    qrcodeBase64: input.qrcodeBase64 ?? null,
    webhookConfigured: input.webhookConfigured,
    profilePicUrl: input.profilePicUrl ?? null,
    profileName: input.profileName ?? null,
    availableInstances: input.availableInstances,
    suggestedInstanceName: input.suggestedInstanceName,
    suggestedProfileName: input.suggestedProfileName,
  };
}

export async function getWhatsAppConnection(): Promise<WhatsAppConnectionView | null> {
  const tenant = await requireTenantContext();
  const suggestedInstanceName = suggestedNameForSlug(tenant.slug);
  const suggestedProfileName = suggestedProfileNameForSlug(tenant.slug);
  const availableInstances = await listUnlinkedInstanceNames(tenant.id);

  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.tenantId, tenant.id))
    .limit(1);

  if (!row) {
    return viewFromParts({
      instanceName: suggestedInstanceName,
      status: "disconnected",
      phoneE164: null,
      webhookConfigured: false,
      availableInstances,
      suggestedInstanceName,
      suggestedProfileName,
    });
  }

  const meta = (row.meta ?? {}) as Record<string, unknown>;
  return viewFromParts({
    instanceName: row.instanceName,
    status: row.status,
    phoneE164: row.phoneE164,
    webhookConfigured: Boolean(meta.webhookUrl),
    profilePicUrl: typeof meta.profilePicUrl === "string" ? meta.profilePicUrl : null,
    profileName: typeof meta.profileName === "string" ? meta.profileName : null,
    availableInstances,
    suggestedInstanceName,
    suggestedProfileName,
  });
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
  let profilePicUrl: string | null =
    typeof row.meta?.profilePicUrl === "string" ? row.meta.profilePicUrl : null;
  let profileName: string | null =
    typeof row.meta?.profileName === "string" ? row.meta.profileName : null;

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
    const meta = pickInstanceMeta(inst);
    if (meta.phoneE164) phoneE164 = meta.phoneE164;
    if (meta.profilePicUrl) profilePicUrl = meta.profilePicUrl;
    // Nome de perfil: o app manda; Evolution só preenche se ainda estiver vazio
    // (evita o sync a cada 5s sobrescrever o nome que a unidade acabou de salvar).
    if (!profileName && meta.profileName) profileName = meta.profileName;
  } catch {
    // Evolution indisponível — mantém último status conhecido
  }

  await db
    .update(schema.whatsappConnections)
    .set({
      status,
      phoneE164: phoneE164 ?? row.phoneE164,
      meta: {
        ...(row.meta ?? {}),
        ...(profilePicUrl ? { profilePicUrl } : {}),
        ...(profileName ? { profileName } : {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.whatsappConnections.id, row.id));

  return { tenantId: row.tenantId, status, phoneE164, profilePicUrl, profileName };
}

/** Vincula uma instância Evolution já existente (ex.: Ragnarok) sem recriar. */
export async function linkWhatsAppInstance(instanceNameRaw: string): Promise<
  { ok: true; data: WhatsAppConnectionView } | { ok: false; error: string }
> {
  try {
    await assertCanManage();
    const tenant = await requireTenantContext();
    const instanceName = instanceNameRaw.trim().slice(0, 120);
    if (!instanceName) return { ok: false, error: "Informe o nome da instância" };

    const db = createDb();
    const [taken] = await db
      .select({ tenantId: schema.whatsappConnections.tenantId })
      .from(schema.whatsappConnections)
      .where(
        and(
          eq(schema.whatsappConnections.instanceName, instanceName),
          ne(schema.whatsappConnections.tenantId, tenant.id)
        )
      )
      .limit(1);
    if (taken) {
      return { ok: false, error: "Essa instância já está vinculada a outra unidade" };
    }

    const remote = await fetchInstances();
    const names = instanceNamesFromEvolution(remote);
    if (!names.includes(instanceName)) {
      return { ok: false, error: `Instância "${instanceName}" não encontrada na Evolution` };
    }

    const webhookUrl = getAgentWebhookUrl();
    await setInstanceWebhook(instanceName, webhookUrl);

    const state = await getConnectionState(instanceName);
    const rawState = state.instance?.state ?? state.state ?? state.status ?? "close";
    const status = mapConnectionStatus(rawState);
    const inst = remote.find(
      (i) =>
        i.instance?.instanceName === instanceName ||
        i.instanceName === instanceName ||
        i.name === instanceName
    );
    const meta = pickInstanceMeta(inst);

    await upsertConnection({
      tenantId: tenant.id,
      instanceName,
      status,
      phoneE164: meta.phoneE164,
      webhookUrl,
      profilePicUrl: meta.profilePicUrl,
      profileName: meta.profileName,
    });

    const availableInstances = await listUnlinkedInstanceNames(tenant.id);
    return {
      ok: true,
      data: viewFromParts({
        instanceName,
        status,
        phoneE164: meta.phoneE164,
        webhookConfigured: true,
        profilePicUrl: meta.profilePicUrl,
        profileName: meta.profileName,
        availableInstances,
        suggestedInstanceName: suggestedNameForSlug(tenant.slug),
        suggestedProfileName: suggestedProfileNameForSlug(tenant.slug),
      }),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao vincular instância",
    };
  }
}

/** Cria instância Evolution (se precisar), configura webhook e retorna QR.
 *  `forceInstanceName` troca o vínculo (ex.: sair de "Nilo" para o slug da unidade). */
export async function startWhatsAppPairing(forceInstanceName?: string): Promise<
  { ok: true; data: WhatsAppConnectionView } | { ok: false; error: string }
> {
  try {
    await assertCanManage();
    const tenant = await requireTenantContext();
    const db = createDb();
    const [existing] = await db
      .select({ instanceName: schema.whatsappConnections.instanceName })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenant.id))
      .limit(1);

    const suggested = suggestedNameForSlug(tenant.slug);
    let instanceName = existing?.instanceName ?? suggested;

    if (forceInstanceName?.trim()) {
      const next = normalizeInstanceName(forceInstanceName);
      if (next.length < 2) {
        return { ok: false, error: "Nome da instância inválido (mín. 2 caracteres)" };
      }
      const [taken] = await db
        .select({ tenantId: schema.whatsappConnections.tenantId })
        .from(schema.whatsappConnections)
        .where(
          and(
            eq(schema.whatsappConnections.instanceName, next),
            ne(schema.whatsappConnections.tenantId, tenant.id)
          )
        )
        .limit(1);
      if (taken) {
        return { ok: false, error: "Esse nome de instância já está em uso por outra unidade" };
      }
      instanceName = next;
    }

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
      phoneE164: null,
    });

    const availableInstances = await listUnlinkedInstanceNames(tenant.id);
    return {
      ok: true,
      data: viewFromParts({
        instanceName,
        status,
        phoneE164: null,
        qrcodeBase64,
        webhookConfigured: true,
        availableInstances,
        suggestedInstanceName: suggested,
        suggestedProfileName: suggestedProfileNameForSlug(tenant.slug),
      }),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao iniciar pareamento",
    };
  }
}

/**
 * Troca o nome técnico da instância Evolution vinculada ao tenant.
 * Evolution não renomeia: desconecta a antiga (opcional delete) e cria a nova.
 */
export async function replaceWhatsAppInstance(newNameRaw: string): Promise<
  { ok: true; data: WhatsAppConnectionView } | { ok: false; error: string }
> {
  try {
    await assertCanManage();
    const tenant = await requireTenantContext();
    const next = normalizeInstanceName(newNameRaw);
    if (next.length < 2) {
      return { ok: false, error: "Informe o novo nome da instância" };
    }

    const db = createDb();
    const [existing] = await db
      .select({ instanceName: schema.whatsappConnections.instanceName })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenant.id))
      .limit(1);

    if (existing?.instanceName === next) {
      return startWhatsAppPairing(next);
    }

    const [taken] = await db
      .select({ tenantId: schema.whatsappConnections.tenantId })
      .from(schema.whatsappConnections)
      .where(
        and(
          eq(schema.whatsappConnections.instanceName, next),
          ne(schema.whatsappConnections.tenantId, tenant.id)
        )
      )
      .limit(1);
    if (taken) {
      return { ok: false, error: "Esse nome já está vinculado a outra unidade" };
    }

    if (existing?.instanceName) {
      try {
        await logoutInstance(existing.instanceName);
      } catch {
        // best-effort
      }
      try {
        await deleteInstance(existing.instanceName);
      } catch {
        // instância pode já ter sido apagada no painel Evolution
      }
    }

    return startWhatsAppPairing(next);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao trocar instância",
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

    const instanceName = row?.instanceName ?? suggestedNameForSlug(tenant.slug);
    let qrcodeBase64: string | null = null;

    // Garante linha no banco antes do sync por instanceName
    if (!row) {
      await upsertConnection({
        tenantId: tenant.id,
        instanceName,
        status: "disconnected",
      });
    }

    const synced = await syncWhatsAppConnectionByInstance(instanceName);
    const status = synced?.status ?? row?.status ?? "disconnected";
    const phoneE164 = synced?.phoneE164 ?? row?.phoneE164 ?? null;
    const profilePicUrl = synced?.profilePicUrl ?? null;
    const profileName = synced?.profileName ?? null;

    try {
      const webhookUrl = getAgentWebhookUrl();
      await setInstanceWebhook(instanceName, webhookUrl);
      await upsertConnection({
        tenantId: tenant.id,
        instanceName,
        status,
        phoneE164,
        webhookUrl,
        profilePicUrl,
        profileName,
      });
    } catch {
      // webhook re-set best-effort
    }

    if (status !== "connected") {
      try {
        const connect = await connectInstance(instanceName);
        qrcodeBase64 = extractQrBase64(connect);
      } catch {
        // QR expirado ou instância já aberta
      }
    }

    const availableInstances = await listUnlinkedInstanceNames(tenant.id);
    return {
      ok: true,
      data: viewFromParts({
        instanceName,
        status,
        phoneE164,
        qrcodeBase64,
        webhookConfigured: true,
        profilePicUrl,
        profileName,
        availableInstances,
        suggestedInstanceName: suggestedNameForSlug(tenant.slug),
        suggestedProfileName: suggestedProfileNameForSlug(tenant.slug),
      }),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao atualizar conexão",
    };
  }
}

export async function updateWhatsAppProfilePicture(picture: string): Promise<
  { ok: true; data: WhatsAppConnectionView } | { ok: false; error: string }
> {
  try {
    await assertCanManage();
    const tenant = await requireTenantContext();
    const pic = picture.trim();
    if (!pic || pic.length < 8) {
      return { ok: false, error: "Informe a URL (ou data-URL) da nova foto" };
    }

    const db = createDb();
    const [row] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenant.id))
      .limit(1);
    if (!row) return { ok: false, error: "Conecte o WhatsApp antes de trocar a foto" };
    if (row.status !== "connected") {
      return { ok: false, error: "WhatsApp precisa estar conectado para trocar a foto" };
    }

    await updateProfilePicture(row.instanceName, pic);
    await upsertConnection({
      tenantId: tenant.id,
      instanceName: row.instanceName,
      status: row.status,
      phoneE164: row.phoneE164,
      profilePicUrl: pic.startsWith("http")
        ? pic
        : typeof row.meta?.profilePicUrl === "string"
          ? row.meta.profilePicUrl
          : null,
    });

    return refreshWhatsAppPairing();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao atualizar foto",
    };
  }
}

export async function updateWhatsAppProfileName(nameRaw: string): Promise<
  { ok: true; data: WhatsAppConnectionView } | { ok: false; error: string }
> {
  try {
    await assertCanManage();
    const tenant = await requireTenantContext();
    const name = nameRaw.trim().slice(0, 80);
    if (name.length < 2) return { ok: false, error: "Nome muito curto" };

    const db = createDb();
    const [row] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenant.id))
      .limit(1);
    if (!row) return { ok: false, error: "Conecte o WhatsApp antes" };
    if (row.status !== "connected") {
      return { ok: false, error: "WhatsApp precisa estar conectado" };
    }

    await updateProfileName(row.instanceName, name);
    await upsertConnection({
      tenantId: tenant.id,
      instanceName: row.instanceName,
      status: row.status,
      phoneE164: row.phoneE164,
      profileName: name,
    });

    return refreshWhatsAppPairing();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao atualizar nome",
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
