import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { formatDateLabelSp, shiftDateSp, todaySp } from "@/lib/datetime";
import { requireSession, requireTenantContext } from "../context/tenant";
import { requireCapability } from "../permissions/guards";
import { getOutreachSettingsForTenant } from "../outreach/settings";
import { enqueueOutreachJob } from "../outreach/queue";
import { renderOutreachTemplate } from "../outreach/templates";

export type BirthdayClientRow = {
  id: string;
  name: string;
  phone: string | null;
  phoneE164: string | null;
  birthDate: string;
};

export async function listBirthdayClients(opts?: {
  range?: "today" | "week";
}): Promise<{
  range: "today" | "week";
  rows: BirthdayClientRow[];
  discountPct: number;
}> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const range = opts?.range === "week" ? "week" : "today";
  const today = todaySp();
  const settings = await getOutreachSettingsForTenant(tenant.id);

  const mmddList =
    range === "today"
      ? [today.slice(5)]
      : Array.from({ length: 7 }, (_, i) => shiftDateSp(today, i).slice(5));

  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      phoneE164: schema.clients.phoneE164,
      birthDate: schema.clients.birthDate,
    })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, tenant.id),
        eq(schema.clients.isActive, true),
        isNull(schema.clients.deletedAt),
        isNotNull(schema.clients.birthDate),
        sql`to_char(${schema.clients.birthDate}, 'MM-DD') in (${sql.join(
          mmddList.map((d) => sql`${d}`),
          sql`, `
        )})`
      )
    )
    .orderBy(asc(sql`to_char(${schema.clients.birthDate}, 'MM-DD')`), asc(schema.clients.name));

  return {
    range,
    discountPct: settings.birthdayDiscountPct,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      phoneE164: r.phoneE164,
      birthDate: String(r.birthDate),
    })),
  };
}

export async function sendBirthdayMessage(clientId: string): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  try {
    const session = await requireSession();
    requireCapability(session, "outreach.write");
    const tenant = await requireTenantContext();
    const settings = await getOutreachSettingsForTenant(tenant.id);
    const db = createDb();
    const today = todaySp();

    const [client] = await db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        phoneE164: schema.clients.phoneE164,
      })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
      .limit(1);

    if (!client) return { ok: false, error: "Cliente não encontrado" };
    const phone = client.phoneE164?.trim();
    if (!phone) return { ok: false, error: "Cliente sem telefone WhatsApp" };

    const discount = Math.max(0, Math.min(100, settings.birthdayDiscountPct || 0));
    const body = renderOutreachTemplate(settings.templateBirthday, {
      nome: client.name,
      barbearia: tenant.name,
      desconto: discount,
      data: formatDateLabelSp(today),
    });

    const res = await enqueueOutreachJob({
      tenantId: tenant.id,
      kind: "birthday",
      phoneE164: phone,
      clientId: client.id,
      body,
      dayKey: `birthday-manual:${today}:${client.id}`,
      meta: { discountPct: discount, manual: true },
    });

    if (!res.created && !res.id) {
      return { ok: false, error: "Mensagem já enfileirada ou bloqueada" };
    }

    return { ok: true, id: res.id || "queued" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao enfileirar mensagem",
    };
  }
}
