import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { normalizeName, normalizePhone } from "./normalize";

/**
 * 1º contato WhatsApp sem cadastro → cria lead no CRM (origem whatsapp).
 * Sem sessão de usuário — chamado pelo webhook da Donna.
 */
export async function ensureWhatsAppLead(input: {
  tenantId: string;
  phoneE164: string;
  pushName?: string | null;
}): Promise<string> {
  const db = createDb();
  const e164 = input.phoneE164.trim();

  const [existing] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, input.tenantId),
        eq(schema.clients.phoneE164, e164),
        isNull(schema.clients.deletedAt)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const { phone, phoneE164 } = normalizePhone(e164);
  const rawName = (input.pushName ?? "").trim();
  const name = normalizeName(
    rawName.length >= 2 ? rawName : `WhatsApp ${phoneE164 ?? e164}`
  );

  const [created] = await db
    .insert(schema.clients)
    .values({
      tenantId: input.tenantId,
      name,
      phone: phone ?? e164,
      phoneE164: phoneE164 ?? e164,
      preferences: {
        howHeard: "whatsapp",
        crmStatus: "lead",
        crmStage: "interessado",
        leadSource: "whatsapp_inbound",
        marketingOptIn: true,
      },
      notes: "Lead criado automaticamente no 1º contato WhatsApp (CRM).",
    })
    .returning({ id: schema.clients.id });

  return created.id;
}
