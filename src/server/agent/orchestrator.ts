import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { SKILL_CATALOG } from "./catalog";
import { executeTool, listToolDefinitions } from "./tools";
import type { OrchestratorInput, OrchestratorResult, AgentSkillName } from "./types";

export async function getDefaultAgentProfile(tenantId: string) {
  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, tenantId),
        eq(schema.agentProfiles.isActive, true),
        eq(schema.agentProfiles.isDefault, true)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Orquestrador v0 (scaffold):
 * - Se mode=human → não responde (recepção no painel)
 * - Heurística leve de skill (sem LLM ainda)
 * - Persona vem do agent_profiles (nome configurável por unidade)
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  if (input.mode === "human") {
    return { reply: null, skills: [], toolCalls: [] };
  }

  const profile = await getDefaultAgentProfile(input.tenantId);
  const displayName = profile?.displayName || profile?.name || "Assistente";
  const enabled = listToolDefinitions(profile?.toolsEnabled ?? undefined);

  const text = input.userText.toLowerCase();
  const skills: AgentSkillName[] = [];
  if (/agend|marcar|horário|horario|reserv/.test(text)) skills.push("skill.schedule");
  if (/comanda|serviço|servico|cortar|barba/.test(text)) skills.push("skill.order");
  if (/voltar|sumiu|faz tempo|saudade/.test(text)) skills.push("skill.followup");
  if (/atendente|humano|pessoa|recep/.test(text)) skills.push("skill.handoff");

  const toolCalls: OrchestratorResult["toolCalls"] = [];

  if (skills.includes("skill.handoff") && enabled.some((t) => t.name === "handoff_human")) {
    const r = await executeTool("handoff_human", {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      agentProfileId: profile?.id,
    });
    toolCalls.push({ name: "handoff_human", ok: r.ok });
    return {
      reply: r.ok
        ? `Claro — já chamei alguém da equipe. Em instantes um humano assume por aqui.`
        : `Não consegui transferir agora. Tente de novo em instantes.`,
      skills,
      toolCalls,
      handoff: r.ok,
    };
  }

  // Contexto mínimo da unidade (prova que tools + tenant funcionam)
  if (enabled.some((t) => t.name === "get_unit_context")) {
    const r = await executeTool("get_unit_context", {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      agentProfileId: profile?.id,
    });
    toolCalls.push({ name: "get_unit_context", ok: r.ok });
  }

  const skillHint =
    skills.length > 0
      ? `Detectei intenção: ${skills.map((s) => SKILL_CATALOG.find((c) => c.name === s)?.title ?? s).join(", ")}.`
      : `Posso ajudar a agendar, tirar dúvidas ou chamar a recepção.`;

  return {
    reply:
      `Olá! Sou ${displayName}. ` +
      `${skillHint} ` +
      `(Scaffold 6.0 — LLM e tools de agenda/comanda entram nas próximas fases.)`,
    skills,
    toolCalls,
  };
}
