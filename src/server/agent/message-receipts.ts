import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";

export type DeliveryStatus =
  | "pending"
  | "sent"
  | "server_ack"
  | "delivered"
  | "read"
  | "error";

const RANK: Record<DeliveryStatus, number> = {
  pending: 0,
  sent: 1,
  server_ack: 2,
  delivered: 3,
  read: 4,
  error: -1,
};

/** Normaliza status Evolution / Baileys → nosso enum. */
export function normalizeDeliveryStatus(raw: unknown): DeliveryStatus | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    switch (raw) {
      case 0:
        return "error";
      case 1:
        return "pending";
      case 2:
        return "server_ack";
      case 3:
        return "delivered";
      case 4:
      case 5:
        return "read";
      default:
        return null;
    }
  }
  const s = String(raw).toUpperCase().replace(/\s+/g, "_");
  if (s === "ERROR" || s === "FAILED") return "error";
  if (s === "PENDING") return "pending";
  if (s === "SERVER_ACK" || s === "SERVER" || s === "SENT") return "server_ack";
  if (s === "DELIVERY_ACK" || s === "DELIVERED" || s === "DELIVERY") return "delivered";
  if (s === "READ" || s === "PLAYED" || s === "READ_ACK") return "read";
  return null;
}

function isUpgrade(current: string | null | undefined, next: DeliveryStatus): boolean {
  if (next === "error") return current !== "error";
  const curRank = RANK[(current as DeliveryStatus) ?? "pending"] ?? 0;
  const nextRank = RANK[next] ?? 0;
  return nextRank > curRank;
}

type UpdatePayload = {
  keyId?: string;
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  status?: unknown;
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  update?: { status?: unknown };
};

function extractUpdateItems(data: unknown): UpdatePayload[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as UpdatePayload[];
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.messages)) return obj.messages as UpdatePayload[];
    return [obj as UpdatePayload];
  }
  return [];
}

/**
 * Aplica MESSAGES_UPDATE da Evolution nas mensagens outbound.
 */
export async function applyMessagesUpdate(data: unknown): Promise<{ updated: number }> {
  const items = extractUpdateItems(data);
  if (!items.length) return { updated: 0 };

  const db = createDb();
  let updated = 0;
  const now = new Date();

  for (const item of items) {
    const waMessageId =
      item.keyId ?? item.key?.id ?? (typeof item.id === "string" ? item.id : null);
    if (!waMessageId) continue;

    const fromMe = item.fromMe ?? item.key?.fromMe;
    if (fromMe === false) continue;

    const status = normalizeDeliveryStatus(item.status ?? item.update?.status);
    if (!status) continue;

    const [row] = await db
      .select({
        id: schema.messages.id,
        deliveryStatus: schema.messages.deliveryStatus,
        deliveredAt: schema.messages.deliveredAt,
        readAt: schema.messages.readAt,
      })
      .from(schema.messages)
      .where(eq(schema.messages.waMessageId, waMessageId))
      .limit(1);

    if (!row) continue;
    if (!isUpgrade(row.deliveryStatus, status)) continue;

    const patch: {
      deliveryStatus: DeliveryStatus;
      updatedAt: Date;
      deliveredAt?: Date;
      readAt?: Date;
    } = {
      deliveryStatus: status,
      updatedAt: now,
    };

    if ((status === "delivered" || status === "read") && !row.deliveredAt) {
      patch.deliveredAt = now;
    }
    if (status === "read" && !row.readAt) {
      patch.readAt = now;
    }

    await db.update(schema.messages).set(patch).where(eq(schema.messages.id, row.id));

    // Espelha status no job de disparo, se houver
    const jobs = await db
      .select({ id: schema.outreachJobs.id, meta: schema.outreachJobs.meta })
      .from(schema.outreachJobs)
      .where(sql`${schema.outreachJobs.meta}->>'waMessageId' = ${waMessageId}`)
      .limit(5);
    for (const job of jobs) {
      await db
        .update(schema.outreachJobs)
        .set({
          meta: {
            ...(job.meta ?? {}),
            waMessageId,
            deliveryStatus: status,
            deliveryUpdatedAt: now.toISOString(),
          },
          updatedAt: now,
        })
        .where(eq(schema.outreachJobs.id, job.id));
    }

    updated += 1;
  }

  return { updated };
}

/**
 * Proxy sem ✓✓ azul: cliente respondeu → marca último outbound sem repliedAt.
 */
export async function markLastOutboundReplied(conversationId: string): Promise<void> {
  const db = createDb();
  const now = new Date();

  const [last] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        inArray(schema.messages.direction, ["outbound_ai", "outbound_human"]),
        isNull(schema.messages.repliedAt)
      )
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);

  if (!last) return;

  await db
    .update(schema.messages)
    .set({ repliedAt: now, updatedAt: now })
    .where(eq(schema.messages.id, last.id));
}

export function deliveryStatusLabel(status: DeliveryStatus | string | null | undefined): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "sent":
    case "server_ack":
      return "Enviado";
    case "delivered":
      return "Entregue";
    case "read":
      return "Lido";
    case "error":
      return "Falhou";
    default:
      return "—";
  }
}
