import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  compilePersonaToSystemPrompt,
  createDefaultPersona,
  isPersonaEmpty,
  type AgentPersona,
} from "./persona";

const DEFAULT_TOOLS = [
  "get_unit_context",
  "find_client",
  "list_services",
  "list_products",
  "list_slots",
  "list_client_appointments",
  "resolve_date",
  "book_appointment",
  "cancel_appointment",
  "open_order",
  "add_order_item",
  "list_open_orders",
  "add_to_waitlist",
  "list_waitlist",
  "list_followups",
  "handoff_human",
  "send_whatsapp",
] as const;

function buildPersonaBundle(input: {
  businessName: string;
  displayName: string;
}): { persona: AgentPersona; systemPrompt: string } {
  const persona = createDefaultPersona({
    businessName: input.businessName,
    agentDisplayName: input.displayName,
    essencia: "acolhimento",
    regraDeOuro: "Hora marcada é hora respeitada",
  });
  const systemPrompt = compilePersonaToSystemPrompt(persona, input.displayName);
  return { persona, systemPrompt };
}

/** Garante persona + prompt compilado em perfis existentes sem persona. */
export async function backfillAgentPersona(input: {
  profileId: string;
  tenantId: string;
  businessName: string;
  displayName: string;
}) {
  const db = createDb();
  const [row] = await db
    .select({ persona: schema.agentProfiles.persona })
    .from(schema.agentProfiles)
    .where(eq(schema.agentProfiles.id, input.profileId))
    .limit(1);

  if (!row || !isPersonaEmpty(row.persona)) return;

  const { persona, systemPrompt } = buildPersonaBundle({
    businessName: input.businessName,
    displayName: input.displayName,
  });

  await db
    .update(schema.agentProfiles)
    .set({ persona, systemPrompt, updatedAt: new Date() })
    .where(
      and(
        eq(schema.agentProfiles.id, input.profileId),
        eq(schema.agentProfiles.tenantId, input.tenantId)
      )
    );
}

export async function ensureDefaultAgentProfile(input: {
  tenantId: string;
  displayName?: string;
  businessName?: string;
}) {
  const db = createDb();
  const displayName = input.displayName?.trim() || "Donna";

  const [tenant] = await db
    .select({ name: schema.tenants.name })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, input.tenantId))
    .limit(1);

  const businessName = input.businessName?.trim() || tenant?.name || "Barbearia";

  const [existing] = await db
    .select({ id: schema.agentProfiles.id, persona: schema.agentProfiles.persona })
    .from(schema.agentProfiles)
    .where(
      and(
        eq(schema.agentProfiles.tenantId, input.tenantId),
        eq(schema.agentProfiles.isDefault, true)
      )
    )
    .limit(1);

  if (existing) {
    if (isPersonaEmpty(existing.persona)) {
      await backfillAgentPersona({
        profileId: existing.id,
        tenantId: input.tenantId,
        businessName,
        displayName,
      });
    }
    return existing.id;
  }

  const { persona, systemPrompt } = buildPersonaBundle({ businessName, displayName });
  const slug = displayName.toLowerCase().replace(/\s+/g, "_").slice(0, 80);

  const [row] = await db
    .insert(schema.agentProfiles)
    .values({
      tenantId: input.tenantId,
      name: slug,
      displayName,
      persona,
      systemPrompt,
      toolsEnabled: [...DEFAULT_TOOLS],
      model: process.env.LLM_MODEL?.trim() || "anthropic/claude-haiku-4.5",
      temperature: 45,
      isDefault: true,
      isActive: true,
    })
    .returning({ id: schema.agentProfiles.id });
  return row.id;
}
