import { and, asc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { dayBoundsSp, formatDateSp, formatTimeSp } from "@/lib/datetime";
import { normalizePhone } from "@/server/clients/normalize";
import { getConnectionForTenant, deliverWhatsAppText } from "./outbound";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return !!value && UUID_RE.test(value);
}

async function resolveStaffId(
  tenantId: string,
  raw: string | undefined
): Promise<string | null> {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (isUuid(value)) return value;
  const db = createDb();
  const [row] = await db
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, tenantId),
        eq(schema.staff.isActive, true),
        isNull(schema.staff.deletedAt),
        or(
          ilike(schema.staff.name, `%${value}%`),
          ilike(schema.staff.nickname, `%${value}%`)
        )
      )
    )
    .limit(1);
  return row?.id ?? null;
}

async function resolveServiceId(
  tenantId: string,
  raw: string | undefined
): Promise<string | null> {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (isUuid(value)) return value;
  const db = createDb();
  const [row] = await db
    .select({ id: schema.services.id })
    .from(schema.services)
    .where(
      and(
        eq(schema.services.tenantId, tenantId),
        eq(schema.services.isActive, true),
        isNull(schema.services.deletedAt),
        ilike(schema.services.name, `%${value}%`)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

async function resolveClientId(
  tenantId: string,
  raw: string | undefined,
  phoneE164: string | null
): Promise<string | null> {
  if (isUuid(raw)) return raw!;
  if (!phoneE164) return null;
  const db = createDb();
  const last11 = phoneE164.replace(/\D/g, "").slice(-11);
  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(
      and(
        eq(schema.clients.tenantId, tenantId),
        isNull(schema.clients.deletedAt),
        sql`right(regexp_replace(coalesce(${schema.clients.phoneE164}, ''), '\\D', '', 'g'), 11) = ${last11}`
      )
    )
    .limit(1);
  return client?.id ?? null;
}

export async function addToWaitlistForAgent(input: {
  tenantId: string;
  clientId?: string;
  phone?: string;
  staffId?: string;
  serviceId?: string;
  desiredDate?: string;
  notes?: string;
}): Promise<ActionResult> {
  const db = createDb();
  const { phone, phoneE164 } = normalizePhone(input.phone);

  const clientId = await resolveClientId(input.tenantId, input.clientId, phoneE164);
  const staffId = await resolveStaffId(input.tenantId, input.staffId);
  const serviceId = await resolveServiceId(input.tenantId, input.serviceId);

  if (!clientId && !phone && !phoneE164) {
    return { ok: false, error: "Informe cliente ou telefone para a lista de espera" };
  }

  let desiredDate: Date | null = null;
  if (input.desiredDate?.trim()) {
    try {
      const bounds = dayBoundsSp(input.desiredDate.trim());
      desiredDate = bounds.start;
    } catch {
      desiredDate = null;
    }
  }

  try {
    // Se já existe espera aberta deste telefone, completa os campos em vez de duplicar
    if (phoneE164) {
      const last11 = phoneE164.replace(/\D/g, "").slice(-11);
      const [existing] = await db
        .select({
          id: schema.waitlistEntries.id,
          staffId: schema.waitlistEntries.staffId,
          serviceId: schema.waitlistEntries.serviceId,
          desiredDate: schema.waitlistEntries.desiredDate,
          notes: schema.waitlistEntries.notes,
        })
        .from(schema.waitlistEntries)
        .where(
          and(
            eq(schema.waitlistEntries.tenantId, input.tenantId),
            eq(schema.waitlistEntries.status, "waiting"),
            sql`right(regexp_replace(coalesce(${schema.waitlistEntries.phone}, ''), '\\D', '', 'g'), 11) = ${last11}`
          )
        )
        .orderBy(asc(schema.waitlistEntries.createdAt))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(schema.waitlistEntries)
          .set({
            clientId: clientId || null,
            staffId: staffId || existing.staffId,
            serviceId: serviceId || existing.serviceId,
            phone: phoneE164 || phone || null,
            desiredDate: desiredDate ?? existing.desiredDate,
            notes:
              input.notes?.trim().slice(0, 500) ||
              existing.notes ||
              null,
            updatedAt: new Date(),
          })
          .where(eq(schema.waitlistEntries.id, existing.id))
          .returning({ id: schema.waitlistEntries.id });
        if (updated?.id) return { ok: true, id: updated.id };
      }
    }

    const [row] = await db
      .insert(schema.waitlistEntries)
      .values({
        tenantId: input.tenantId,
        clientId: clientId || null,
        staffId: staffId || null,
        serviceId: serviceId || null,
        phone: phoneE164 || phone || null,
        desiredDate,
        status: "waiting",
        notes: input.notes?.trim().slice(0, 500) || null,
      })
      .returning({ id: schema.waitlistEntries.id });

    if (!row?.id) return { ok: false, error: "Falha ao gravar lista de espera" };
    return { ok: true, id: row.id };
  } catch (err) {
    // Último recurso: grava só telefone + notas (sem FKs)
    try {
      const [row] = await db
        .insert(schema.waitlistEntries)
        .values({
          tenantId: input.tenantId,
          clientId: null,
          staffId: null,
          serviceId: null,
          phone: phoneE164 || phone || null,
          desiredDate,
          status: "waiting",
          notes: input.notes?.trim().slice(0, 500) || null,
        })
        .returning({ id: schema.waitlistEntries.id });
      if (!row?.id) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Erro ao gravar espera",
        };
      }
      return { ok: true, id: row.id };
    } catch (err2) {
      return {
        ok: false,
        error: err2 instanceof Error ? err2.message : "Erro ao gravar espera",
      };
    }
  }
}

/** Zera a lista de espera do tenant (Donna assume daqui pra frente). */
export async function clearWaitlistForTenant(tenantId: string) {
  const db = createDb();
  const deleted = await db
    .delete(schema.waitlistEntries)
    .where(eq(schema.waitlistEntries.tenantId, tenantId))
    .returning({ id: schema.waitlistEntries.id });
  return { ok: true as const, deleted: deleted.length };
}

export async function listWaitlistForAgent(input: {
  tenantId: string;
  status?: "waiting" | "notified" | "all";
  limit?: number;
}) {
  const db = createDb();
  const status = input.status ?? "waiting";
  const limit = Math.min(40, Math.max(1, input.limit ?? 15));

  let where = and(
    eq(schema.waitlistEntries.tenantId, input.tenantId),
    status === "all" ? undefined : eq(schema.waitlistEntries.status, status)
  );

  const rows = await db
    .select({
      id: schema.waitlistEntries.id,
      phone: schema.waitlistEntries.phone,
      status: schema.waitlistEntries.status,
      notes: schema.waitlistEntries.notes,
      desiredDate: schema.waitlistEntries.desiredDate,
      clientName: schema.clients.name,
      staffName: schema.staff.name,
      serviceName: schema.services.name,
    })
    .from(schema.waitlistEntries)
    .leftJoin(schema.clients, eq(schema.waitlistEntries.clientId, schema.clients.id))
    .leftJoin(schema.staff, eq(schema.waitlistEntries.staffId, schema.staff.id))
    .leftJoin(schema.services, eq(schema.waitlistEntries.serviceId, schema.services.id))
    .where(where)
    .orderBy(asc(schema.waitlistEntries.desiredDate), asc(schema.waitlistEntries.createdAt))
    .limit(limit);

  return {
    ok: true as const,
    count: rows.length,
    entries: rows.map((r) => ({
      id: r.id,
      clientName: r.clientName,
      phone: r.phone,
      staffName: r.staffName,
      serviceName: r.serviceName,
      status: r.status,
      notes: r.notes,
      desiredDate: r.desiredDate ? formatDateSp(r.desiredDate) : null,
    })),
  };
}

/**
 * Quando um horário é cancelado, notifica o primeiro da espera compatível
 * e pergunta se pode agendar naquele slot.
 */
export async function promoteWaitlistOnCancel(input: {
  tenantId: string;
  staffId?: string | null;
  serviceId?: string | null;
  startsAt: Date;
}): Promise<{ promoted: boolean; entryId?: string; error?: string }> {
  const db = createDb();
  const day = dayBoundsSp(formatDateSp(input.startsAt));

  const conditions = [
    eq(schema.waitlistEntries.tenantId, input.tenantId),
    eq(schema.waitlistEntries.status, "waiting"),
    or(
      isNull(schema.waitlistEntries.desiredDate),
      and(
        gte(schema.waitlistEntries.desiredDate, day.start),
        lte(schema.waitlistEntries.desiredDate, day.end)
      )
    ),
  ];

  if (input.staffId) {
    conditions.push(
      or(isNull(schema.waitlistEntries.staffId), eq(schema.waitlistEntries.staffId, input.staffId))!
    );
  }
  if (input.serviceId) {
    conditions.push(
      or(
        isNull(schema.waitlistEntries.serviceId),
        eq(schema.waitlistEntries.serviceId, input.serviceId)
      )!
    );
  }

  const [entry] = await db
    .select({
      id: schema.waitlistEntries.id,
      phone: schema.waitlistEntries.phone,
      clientId: schema.waitlistEntries.clientId,
      clientName: schema.clients.name,
      clientPhone: schema.clients.phoneE164,
    })
    .from(schema.waitlistEntries)
    .leftJoin(schema.clients, eq(schema.waitlistEntries.clientId, schema.clients.id))
    .where(and(...conditions))
    .orderBy(asc(schema.waitlistEntries.createdAt))
    .limit(1);

  if (!entry) return { promoted: false };

  const phoneE164 = entry.clientPhone || entry.phone;
  if (!phoneE164) {
    await db
      .update(schema.waitlistEntries)
      .set({ status: "notified", notifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.waitlistEntries.id, entry.id));
    return { promoted: true, entryId: entry.id, error: "Sem telefone para avisar" };
  }

  const [tenant] = await db
    .select({ name: schema.tenants.name })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, input.tenantId))
    .limit(1);

  const timeLabel = formatTimeSp(input.startsAt);
  const dateLabel = input.startsAt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
  const name = entry.clientName?.split(" ")[0] || "Oi";
  const text =
    `${name}, liberou um horário na ${tenant?.name ?? "unidade"} em ${dateLabel} às ${timeLabel}. ` +
    `Posso te agendar nesse horário? Responda SIM ou diga outro horário de preferência.`;

  const conn = await getConnectionForTenant(input.tenantId);
  if (!conn?.instanceName || conn.status !== "connected") {
    await db
      .update(schema.waitlistEntries)
      .set({ status: "notified", notifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.waitlistEntries.id, entry.id));
    return { promoted: true, entryId: entry.id, error: "WhatsApp desconectado" };
  }

  const digits = phoneE164.replace(/\D/g, "");
  const e164 = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  let [conv] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.tenantId, input.tenantId),
        eq(schema.conversations.phoneE164, e164)
      )
    )
    .limit(1);

  if (!conv) {
    const [created] = await db
      .insert(schema.conversations)
      .values({
        tenantId: input.tenantId,
        phoneE164: e164,
        clientId: entry.clientId,
        mode: "ai",
      })
      .returning({ id: schema.conversations.id });
    conv = created;
  }

  const sent = await deliverWhatsAppText({
    tenantId: input.tenantId,
    instanceName: conn.instanceName,
    phoneE164: e164,
    text,
    conversationId: conv.id,
    direction: "outbound_ai",
  });

  await db
    .update(schema.waitlistEntries)
    .set({ status: "notified", notifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.waitlistEntries.id, entry.id));

  if (!sent.ok) {
    return { promoted: true, entryId: entry.id, error: sent.error };
  }

  return { promoted: true, entryId: entry.id };
}
