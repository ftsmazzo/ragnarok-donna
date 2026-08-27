import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { normalizePhone } from "@/server/clients/normalize";
import { requireTenantContext } from "@/server/context/tenant";
import {
  compilePersonaToSystemPrompt,
  mergePersona,
  type AgentPersona,
  type PersonaPatch,
} from "./persona";
import { ensureDefaultAgentProfile } from "./persona-profile";

export type AgentConfigView = {
  profileId: string;
  displayName: string;
  businessName: string;
  greeting: string;
  handoffNotifyPhone: string;
  handoffNotifyPhoneE164: string | null;
  whatsappConnected: boolean;
  whatsappInstance: string | null;
};

function readPersona(raw: unknown): AgentPersona | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as AgentPersona;
}

function readHandoffPhone(meta: Record<string, unknown> | null | undefined): string {
  const v = meta?.handoffNotifyPhone;
  return typeof v === "string" ? v : "";
}

/** Lê config do agente default deste tenant (cria perfil se faltar). */
export async function getAgentConfig(): Promise<AgentConfigView> {
  const tenant = await requireTenantContext();
  await ensureDefaultAgentProfile({
    tenantId: tenant.id,
    businessName: tenant.name,
  });

  const db = createDb();
  const [profile] = await db
    .select({
      id: schema.agentProfiles.id,
      displayName: schema.agentProfiles.displayName,
      persona: schema.agentProfiles.persona,
      meta: schema.agentProfiles.meta,
    })
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, tenant.id),
        eq(schema.agentProfiles.isDefault, true),
        eq(schema.agentProfiles.isActive, true)
      )
    )
    .limit(1);

  if (!profile) {
    throw new Error("Perfil do agente não encontrado");
  }

  const persona = readPersona(profile.persona);
  const handoffRaw = readHandoffPhone(profile.meta as Record<string, unknown>);
  const { phoneE164 } = normalizePhone(handoffRaw);

  const [wa] = await db
    .select({
      status: schema.whatsappConnections.status,
      instanceName: schema.whatsappConnections.instanceName,
    })
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.tenantId, tenant.id))
    .limit(1);

  return {
    profileId: profile.id,
    displayName: profile.displayName || "Donna",
    businessName: persona?.cliente?.nome_negocio?.trim() || tenant.name,
    greeting: persona?.persona?.oralidade?.saudacao_padrao?.trim() || "",
    handoffNotifyPhone: handoffRaw,
    handoffNotifyPhoneE164: phoneE164,
    whatsappConnected: (wa?.status ?? "") === "connected",
    whatsappInstance: wa?.instanceName ?? null,
  };
}

export type SaveAgentConfigInput = {
  displayName: string;
  businessName: string;
  greeting: string;
  handoffNotifyPhone: string;
};

/** Salva personalização + telefone de alerta de handoff (por tenant). */
export async function saveAgentConfig(
  input: SaveAgentConfigInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const displayName = input.displayName.trim().slice(0, 80) || "Donna";
  const businessName = input.businessName.trim().slice(0, 120) || tenant.name;
  const greeting = input.greeting.trim().slice(0, 240);
  const phoneRaw = input.handoffNotifyPhone.trim();
  const { phone: phoneFmt, phoneE164 } = normalizePhone(phoneRaw);

  if (phoneRaw && !phoneE164) {
    return { ok: false, error: "Telefone de alerta inválido. Use DDD + número." };
  }

  const [profile] = await db
    .select({
      id: schema.agentProfiles.id,
      persona: schema.agentProfiles.persona,
      meta: schema.agentProfiles.meta,
    })
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, tenant.id),
        eq(schema.agentProfiles.isDefault, true)
      )
    )
    .limit(1);

  if (!profile) {
    return { ok: false, error: "Perfil do agente não encontrado" };
  }

  const base = readPersona(profile.persona);
  if (!base) {
    return { ok: false, error: "Persona inválida no perfil" };
  }

  const patch: PersonaPatch = {
    cliente: {
      nome_negocio: businessName,
      agente_representa: "recepção",
    },
    persona: {
      oralidade: {
        saudacao_padrao:
          greeting ||
          `Olá! Aqui é a ${displayName}, recepção da ${businessName}.`,
      },
    },
  };

  const persona = mergePersona(base, patch);
  const systemPrompt = compilePersonaToSystemPrompt(persona, displayName);
  const prevMeta =
    profile.meta && typeof profile.meta === "object"
      ? (profile.meta as Record<string, unknown>)
      : {};

  await db
    .update(schema.agentProfiles)
    .set({
      name: displayName.slice(0, 80),
      displayName,
      persona,
      systemPrompt,
      meta: {
        ...prevMeta,
        handoffNotifyPhone: phoneE164 ? phoneFmt ?? phoneRaw : "",
        handoffNotifyPhoneE164: phoneE164,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.agentProfiles.id, profile.id),
        eq(schema.agentProfiles.tenantId, tenant.id)
      )
    );

  return { ok: true };
}

/** Telefone E.164 configurado para alerta de handoff neste tenant. */
export async function getHandoffNotifyPhoneE164(tenantId: string): Promise<string | null> {
  const db = createDb();
  const [profile] = await db
    .select({ meta: schema.agentProfiles.meta })
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, tenantId),
        eq(schema.agentProfiles.isDefault, true),
        eq(schema.agentProfiles.isActive, true)
      )
    )
    .limit(1);

  const meta = (profile?.meta ?? {}) as Record<string, unknown>;
  const e164 = meta.handoffNotifyPhoneE164;
  if (typeof e164 === "string" && e164.startsWith("+")) return e164;
  const raw = typeof meta.handoffNotifyPhone === "string" ? meta.handoffNotifyPhone : "";
  return normalizePhone(raw).phoneE164;
}
