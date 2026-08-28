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
  essencia: string;
  tomTraits: string;
  regraDeOuro: string;
  temaEmocional: string;
  expressoesTipicas: string;
  termosTecnicos: string;
  termosProibidos: string;
  descaracteriza: string;
  historiaMarcaUsar: boolean;
  historiaMarcaEpisodios: string;
  perguntaRespostaUsar: boolean;
  perguntaRespostaExemplo: string;
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

function joinList(items: string[] | undefined): string {
  return (items ?? []).join(", ");
}

function joinLines(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}

function splitCommas(raw: string, max = 24): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function splitLines(raw: string, max = 16): string[] {
  return raw
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
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
  const p = persona?.persona;
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
    essencia: p?.essencia?.trim() || "",
    tomTraits: joinList(p?.tom?.tracos),
    regraDeOuro: p?.regra_de_ouro?.trim() || "",
    temaEmocional: p?.tema_emocional_central?.trim() || "",
    expressoesTipicas: joinList(p?.oralidade?.expressoes_tipicas),
    termosTecnicos: joinList(p?.vocabulario?.termos_tecnicos),
    termosProibidos: joinList(p?.vocabulario?.termos_proibidos),
    descaracteriza: joinLines(p?.descaracteriza),
    historiaMarcaUsar: Boolean(p?.historia_marca?.usar),
    historiaMarcaEpisodios: joinLines(p?.historia_marca?.episodios),
    perguntaRespostaUsar: Boolean(p?.padroes_de_frase?.pergunta_resposta?.usar),
    perguntaRespostaExemplo: p?.padroes_de_frase?.pergunta_resposta?.exemplo?.trim() || "",
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
  essencia: string;
  tomTraits: string;
  regraDeOuro: string;
  temaEmocional: string;
  expressoesTipicas: string;
  termosTecnicos: string;
  termosProibidos: string;
  descaracteriza: string;
  historiaMarcaUsar: boolean;
  historiaMarcaEpisodios: string;
  perguntaRespostaUsar: boolean;
  perguntaRespostaExemplo: string;
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
  const greeting =
    input.greeting.trim().slice(0, 240) ||
    `Olá! Aqui é a ${displayName}, recepção da ${businessName}.`;
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
      essencia: input.essencia.trim().slice(0, 280) || base.persona.essencia,
      tom: { tracos: splitCommas(input.tomTraits, 12) },
      regra_de_ouro: input.regraDeOuro.trim().slice(0, 200) || base.persona.regra_de_ouro,
      tema_emocional_central:
        input.temaEmocional.trim().slice(0, 280) || base.persona.tema_emocional_central,
      vocabulario: {
        termos_tecnicos: splitCommas(input.termosTecnicos, 24),
        termos_proibidos: splitCommas(input.termosProibidos, 24),
      },
      oralidade: {
        saudacao_padrao: greeting,
        expressoes_tipicas: splitCommas(input.expressoesTipicas, 16),
      },
      descaracteriza: splitLines(input.descaracteriza, 16),
      historia_marca: {
        usar: input.historiaMarcaUsar,
        episodios: input.historiaMarcaUsar ? splitLines(input.historiaMarcaEpisodios, 12) : [],
      },
      padroes_de_frase: {
        pergunta_resposta: {
          usar: input.perguntaRespostaUsar,
          exemplo: input.perguntaRespostaExemplo.trim().slice(0, 200),
        },
      },
    },
    fluxos: {
      saudacao_inicial: greeting,
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
