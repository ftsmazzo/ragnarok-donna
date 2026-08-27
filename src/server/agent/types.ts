/** Nomes canônicos das tools v1 — ver docs/DONNA.md */
export const AGENT_TOOL_NAMES = [
  "get_unit_context",
  "find_client",
  "list_services",
  "list_slots",
  "list_client_appointments",
  "book_appointment",
  "cancel_appointment",
  "open_order",
  "add_order_item",
  "list_followups",
  "handoff_human",
  "send_whatsapp",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export const AGENT_SKILL_NAMES = [
  "skill.schedule",
  "skill.order",
  "skill.followup",
  "skill.handoff",
] as const;

export type AgentSkillName = (typeof AGENT_SKILL_NAMES)[number];

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  /** Skills que tipicamente usam esta tool */
  skills: AgentSkillName[];
  /** Se true, exige conexão WhatsApp ativa */
  needsWhatsApp?: boolean;
};

export type AgentSkillDefinition = {
  name: AgentSkillName;
  title: string;
  description: string;
  tools: AgentToolName[];
};

export type ToolResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

export type OrchestratorInput = {
  tenantId: string;
  conversationId: string;
  phoneE164: string;
  userText: string;
  mode: "ai" | "human";
};

export type OrchestratorResult = {
  reply: string | null;
  /** Skills sugeridas / usadas (audit) */
  skills: AgentSkillName[];
  toolCalls: { name: AgentToolName; ok: boolean }[];
  handoff?: boolean;
};
