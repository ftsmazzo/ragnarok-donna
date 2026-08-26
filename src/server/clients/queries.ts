import {
  and,
  asc,
  count,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { createDb, schema } from "@/db";
import { NotFoundError } from "../errors";
import { requireTenantContext } from "../context/tenant";

export const CLIENT_PAGE_SIZE = 50;

export type ClientFilter = "ativos" | "removidos" | "todos";

export type ClientListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  deletedAt: Date | null;
};

export type ClientDetail = ClientListItem & {
  phoneE164: string | null;
  notes: string | null;
  birthDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  externalSource: string | null;
};

function clientFilterWhere(tenantId: string, filter: ClientFilter) {
  const base = eq(schema.clients.tenantId, tenantId);
  if (filter === "ativos") {
    return and(base, eq(schema.clients.isActive, true), isNull(schema.clients.deletedAt));
  }
  if (filter === "removidos") {
    return and(
      base,
      or(eq(schema.clients.isActive, false), isNotNull(schema.clients.deletedAt))
    );
  }
  return base;
}

export async function listClients(opts: {
  q?: string;
  filter?: ClientFilter;
  page?: number;
}) {
  const tenant = await requireTenantContext();
  const db = createDb();
  const filter = opts.filter ?? "ativos";
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();

  let where = clientFilterWhere(tenant.id, filter);
  if (q) {
    where = and(
      where,
      or(
        ilike(schema.clients.name, `%${q}%`),
        ilike(schema.clients.phone, `%${q}%`),
        ilike(schema.clients.email, `%${q}%`)
      )
    );
  }

  const [totalRow] = await db.select({ n: count() }).from(schema.clients).where(where);

  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      email: schema.clients.email,
      loyaltyPoints: schema.clients.loyaltyPoints,
      isActive: schema.clients.isActive,
      deletedAt: schema.clients.deletedAt,
    })
    .from(schema.clients)
    .where(where)
    .orderBy(asc(schema.clients.name))
    .limit(CLIENT_PAGE_SIZE)
    .offset((page - 1) * CLIENT_PAGE_SIZE);

  const total = Number(totalRow?.n ?? 0);
  return {
    rows,
    total,
    page,
    pageSize: CLIENT_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / CLIENT_PAGE_SIZE)),
    filter,
    q: q ?? "",
  };
}

export async function getClient(clientId: string): Promise<ClientDetail> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const [row] = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      phone: schema.clients.phone,
      phoneE164: schema.clients.phoneE164,
      email: schema.clients.email,
      notes: schema.clients.notes,
      birthDate: schema.clients.birthDate,
      loyaltyPoints: schema.clients.loyaltyPoints,
      isActive: schema.clients.isActive,
      deletedAt: schema.clients.deletedAt,
      createdAt: schema.clients.createdAt,
      updatedAt: schema.clients.updatedAt,
      externalSource: schema.clients.externalSource,
    })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Cliente não encontrado");
  }

  return {
    ...row,
    birthDate: row.birthDate ?? null,
  };
}
