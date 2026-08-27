import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  RAGNAROK_BUSINESS_PROFILE,
  readBusinessProfileFromSettings,
  type BusinessProfile,
} from "./business-profile";
import {
  compilePersonaToSystemPrompt,
  createDefaultPersona,
  mergePersona,
  type AgentPersona,
  type PersonaPatch,
} from "./persona";

function ragnarokPersonaPatch(businessName: string): PersonaPatch {
  return {
    cliente: {
      nome_negocio: businessName,
      segmento: "barbearia",
      agente_representa: "recepção",
    },
    persona: {
      essencia: "acolhimento com precisão e pontualidade",
      tom: { tracos: ["caloroso", "direto", "ágil", "orgulhoso da marca", "sem enrolação"] },
      historia_marca: {
        usar: true,
        episodios: [
          "Desde 2019 elevando o nível do cuidado masculino em Catanduva.",
          "Atendimento com horário marcado — sem fila e sem furo.",
          "Visagismo e corte estratégico no formato do rosto; barba com navalha e toalha quente.",
          "Ambiente climatizado, equipe especialista em clássico e moderno, consultoria de imagem.",
          "Slogan da casa: Total na Sua Imagem.",
        ],
      },
      vocabulario: {
        termos_tecnicos: [
          "degradê",
          "barba",
          "combo",
          "visagismo",
          "horário fechado",
          "encaixe",
          "hidratação de barba",
          "pezinho",
        ],
        termos_proibidos: [
          "bot",
          "inteligência artificial",
          "assistente virtual",
          "chatbot",
          "prompt",
        ],
      },
      oralidade: {
        saudacao_padrao: `Olá! Aqui é a Donna, recepção da ${businessName}.`,
        expressoes_tipicas: ["Perfeito", "Combinado", "Deixa comigo", "Sem enrolação"],
        forma_de_tratamento: "você",
      },
      tema_emocional_central:
        "Respeito pelo tempo do cliente e orgulho do trabalho bem feito na imagem masculina",
      regra_de_ouro: "Hora marcada é hora respeitada",
      descaracteriza: [
        "Inventar preço ou duração de serviço",
        "Prometer horário sem consultar a agenda",
        "Falar como um barbeiro específico (você é a recepção)",
        "Usar linguagem robótica ou excessivamente formal",
        "Ignorar pedido de atendimento humano",
        "Informar WhatsApp antigo do site — use só o número desta conversa",
      ],
      padroes_de_frase: {
        pergunta_resposta: {
          usar: true,
          exemplo: "Quer agendar, saber endereço/horário ou falar de produto?",
        },
      },
    },
  };
}

/** Grava branding + dados da unidade em tenants.settings e refresca persona Donna. */
export async function ensureBusinessProfile(input: {
  tenantId: string;
  profile?: BusinessProfile;
  force?: boolean;
}): Promise<{ ok: true; applied: boolean; profile: BusinessProfile } | { ok: false; error: string }> {
  const db = createDb();
  const profile = input.profile ?? RAGNAROK_BUSINESS_PROFILE;

  const [tenant] = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
      settings: schema.tenants.settings,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, input.tenantId))
    .limit(1);

  if (!tenant) return { ok: false, error: "tenant não encontrado" };

  const existing = readBusinessProfileFromSettings(tenant.settings);
  if (existing && !input.force) {
    return { ok: true, applied: false, profile: existing };
  }

  const prev =
    tenant.settings && typeof tenant.settings === "object"
      ? (tenant.settings as Record<string, unknown>)
      : {};

  const settings = {
    ...prev,
    businessProfile: profile,
    branding: profile.brand,
  };

  await db
    .update(schema.tenants)
    .set({
      name: profile.nomeFantasia,
      settings,
      updatedAt: new Date(),
    })
    .where(eq(schema.tenants.id, input.tenantId));

  const [branch] = await db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(
      and(
        eq(schema.branches.tenantId, input.tenantId),
        eq(schema.branches.isActive, true),
        isNull(schema.branches.deletedAt)
      )
    )
    .limit(1);

  if (branch) {
    await db
      .update(schema.branches)
      .set({
        name: profile.nomeFantasia,
        address: profile.endereco.textoCompleto,
        updatedAt: new Date(),
      })
      .where(eq(schema.branches.id, branch.id));
  }

  const businessName = profile.nomeFantasia;
  const base = createDefaultPersona({
    businessName,
    agentDisplayName: "Donna",
    essencia: "acolhimento com precisão e pontualidade",
    regraDeOuro: "Hora marcada é hora respeitada",
  });
  const persona = mergePersona(base, ragnarokPersonaPatch(businessName));
  const systemPrompt = compilePersonaToSystemPrompt(persona, "Donna");

  const [agent] = await db
    .select({ id: schema.agentProfiles.id })
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, input.tenantId),
        eq(schema.agentProfiles.isDefault, true)
      )
    )
    .limit(1);

  if (agent) {
    await db
      .update(schema.agentProfiles)
      .set({
        displayName: "Donna",
        persona,
        systemPrompt,
        model: process.env.LLM_MODEL?.trim() || "anthropic/claude-sonnet-4.6",
        updatedAt: new Date(),
      })
      .where(eq(schema.agentProfiles.id, agent.id));
  }

  return { ok: true, applied: true, profile };
}

/** Se o tenant ainda não tem businessProfile, aplica o da Ragnarok (slug/nome). */
export async function ensureBusinessProfileIfMissing(tenantId: string) {
  const db = createDb();
  const [tenant] = await db
    .select({
      settings: schema.tenants.settings,
      slug: schema.tenants.slug,
      name: schema.tenants.name,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;
  const current = readBusinessProfileFromSettings(tenant.settings);
  if (current) return current;
  const looksRagnarok =
    /ragnarok/i.test(tenant.slug || "") || /ragnarok/i.test(tenant.name || "");
  if (!looksRagnarok) return null;
  const result = await ensureBusinessProfile({ tenantId, force: false });
  return result.ok ? result.profile : null;
}

export type { AgentPersona };
