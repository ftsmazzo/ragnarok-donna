/**
 * Fidelidade cliente × barbeiro — governa se o agente oferece outros profissionais.
 * >5 visitas com o pedido → só horários dele + espera preferencial
 * 1–4 → pode oferecer até 3 opções combinadas
 * 0 → fluxo normal de alternativas
 */
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";

export type StaffLoyaltyTier = "loyal" | "familiar" | "new";

export type StaffLoyalty = {
  staffId: string;
  staffName: string;
  visitCount: number;
  tier: StaffLoyaltyTier;
  /** Instrução curta para a LLM / flowInstruction */
  policy: string;
};

const DONE_STATUSES = ["completed", "arrived", "in_progress"] as const;

export function tierFromVisitCount(n: number): StaffLoyaltyTier {
  if (n >= 5) return "loyal";
  if (n >= 1) return "familiar";
  return "new";
}

export function policyForTier(tier: StaffLoyaltyTier, staffName: string): string {
  if (tier === "loyal") {
    return (
      `CLIENTE FIEL deste barbeiro (${staffName}, ≥5 atendimentos). ` +
      `NÃO ofereça outro profissional. Liste só os melhores horários DELE. ` +
      `Se o dia estiver cheio ou a hora pedida ocupada: espere com preferência nele (add_to_waitlist com o nome dele) — sem menu de outros barbeiros.`
    );
  }
  if (tier === "familiar") {
    return (
      `Cliente já veio ${staffName ? `com ${staffName}` : "com este barbeiro"} (1–4 vezes). ` +
      `Prefira horários dele. Se não houver vaga: ofereça até 3 opções combinadas (outros horários dele e/ou outro barbeiro no mesmo período) + espera preferencial com ele.`
    );
  }
  return (
    `Cliente sem histórico forte com este barbeiro. ` +
    `Se pediu pelo nome, priorize os slots dele; se o dia estiver cheio, aí sim até 3 alternativas combinadas.`
  );
}

export async function countVisitsWithStaff(input: {
  tenantId: string;
  clientId: string;
  staffId: string;
}): Promise<number> {
  const db = createDb();
  const [fromAppts] = await db
    .select({ n: count() })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.tenantId, input.tenantId),
        eq(schema.appointments.clientId, input.clientId),
        eq(schema.appointments.staffId, input.staffId),
        isNull(schema.appointments.deletedAt),
        inArray(schema.appointments.status, [...DONE_STATUSES])
      )
    );

  const [fromOrders] = await db
    .select({ n: count() })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(
      and(
        eq(schema.orders.tenantId, input.tenantId),
        eq(schema.orders.clientId, input.clientId),
        eq(schema.orderItems.staffId, input.staffId),
        isNull(schema.orders.deletedAt),
        eq(schema.orderItems.itemType, "service"),
        sql`${schema.orderItems.staffId} is not null`
      )
    );

  // Preferir o maior entre as duas fontes (comanda e agenda costumam espelhar a mesma visita).
  return Math.max(Number(fromAppts?.n ?? 0), Number(fromOrders?.n ?? 0));
}

export async function resolveStaffLoyalty(input: {
  tenantId: string;
  clientId: string | null | undefined;
  staffId: string;
  staffName?: string | null;
}): Promise<StaffLoyalty | null> {
  if (!input.clientId) return null;
  const db = createDb();
  const [staff] = await db
    .select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.id, input.staffId),
        eq(schema.staff.tenantId, input.tenantId),
        isNull(schema.staff.deletedAt)
      )
    )
    .limit(1);
  if (!staff) return null;

  const visitCount = await countVisitsWithStaff({
    tenantId: input.tenantId,
    clientId: input.clientId,
    staffId: staff.id,
  });
  const tier = tierFromVisitCount(visitCount);
  const name = input.staffName?.trim() || staff.name;
  return {
    staffId: staff.id,
    staffName: name,
    visitCount,
    tier,
    policy: policyForTier(tier, name),
  };
}
