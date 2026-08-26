import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@/db";

/** Condições para comandas ligadas ao cliente (direto ou via agenda Com_Codigo). */
export function ordersForClientWhere(
  tenantId: string,
  clientId: string,
  clientExternalId: string | null
): SQL {
  const parts: SQL[] = [
    eq(schema.orders.clientId, clientId),
    sql`exists (
      select 1 from ${schema.appointments} a
      where a.tenant_id = ${tenantId}
        and a.client_id = ${clientId}
        and a.deleted_at is null
        and coalesce(a.meta->>'comCodigo', '') <> ''
        and a.meta->>'comCodigo' = ${schema.orders.externalId}
        and a.external_source = 'appbarber'
        and ${schema.orders.externalSource} = 'appbarber'
    )`,
  ];

  if (clientExternalId) {
    parts.push(sql`${schema.orders.meta}->>'appbarberClientCode' = ${clientExternalId}`);
  }

  return or(...parts)!;
}

/** Agendamentos do cliente + slots ligados às comandas dele. */
export function appointmentsForClientWhere(
  tenantId: string,
  clientId: string,
  clientExternalId: string | null
): SQL {
  const parts: SQL[] = [eq(schema.appointments.clientId, clientId)];

  parts.push(sql`exists (
    select 1 from ${schema.orders} o
    where o.tenant_id = ${tenantId}
      and o.client_id = ${clientId}
      and o.deleted_at is null
      and coalesce(${schema.appointments.meta}->>'comCodigo', '') <> ''
      and ${schema.appointments.meta}->>'comCodigo' = o.external_id
      and o.external_source = 'appbarber'
      and ${schema.appointments.externalSource} = 'appbarber'
  )`);

  if (clientExternalId) {
    parts.push(sql`${schema.appointments.meta}->>'codCliente' = ${clientExternalId}`);
  }

  return or(...parts)!;
}

export function scopedTenantWhere(tenantId: string) {
  return eq(schema.orders.tenantId, tenantId);
}

export function scopedApptTenantWhere(tenantId: string) {
  return eq(schema.appointments.tenantId, tenantId);
}

export function notDeletedOrders() {
  return isNull(schema.orders.deletedAt);
}

export function notDeletedAppts() {
  return isNull(schema.appointments.deletedAt);
}

export function andWhere(...parts: (SQL | undefined)[]) {
  const filtered = parts.filter(Boolean) as SQL[];
  return filtered.length === 1 ? filtered[0] : and(...filtered);
}
