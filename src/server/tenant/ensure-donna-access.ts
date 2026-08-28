import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";

const DONNA_SLUG = "donna-elegant";
const FROM_SLUG = process.env.DONNA_OWNER_FROM_TENANT ?? "ragnaroks";

const BRANCHES = [
  {
    slug: "unidade-01",
    name: "Donna Elegant — Unidade 01",
    address: "Rua Curitiba, 486 — Catanduva-SP",
    externalId: "unidade-01",
  },
  {
    slug: "unidade-02",
    name: "Donna Elegant — Unidade 02",
    address: "Endereço a definir — Catanduva-SP",
    externalId: "unidade-02",
  },
] as const;

/** Cria tenant Donna + branches + vincula owner da Ragnarok (idempotente). */
export async function ensureDonnaElegantAccess(): Promise<
  { ok: true; ownerEmail: string } | { ok: false; error: string }
> {
  const db = createDb();

  let [tenant] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, DONNA_SLUG))
    .limit(1);

  if (!tenant) {
    [tenant] = await db
      .insert(schema.tenants)
      .values({
        name: "Donna Elegant",
        slug: DONNA_SLUG,
        planCode: "network",
        status: "active",
      })
      .returning({ id: schema.tenants.id });
  }

  const tenantId = tenant.id;

  for (const b of BRANCHES) {
    const [existing] = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(and(eq(schema.branches.tenantId, tenantId), eq(schema.branches.slug, b.slug)))
      .limit(1);

    if (existing) {
      await db
        .update(schema.branches)
        .set({ name: b.name, address: b.address, updatedAt: new Date() })
        .where(eq(schema.branches.id, existing.id));
    } else {
      await db.insert(schema.branches).values({
        tenantId,
        name: b.name,
        slug: b.slug,
        address: b.address,
        isActive: true,
        externalSource: "donna",
        externalId: b.externalId,
      });
    }
  }

  const [agent] = await db
    .select({ id: schema.agentProfiles.id })
    .from(schema.agentProfiles)
    .where(
      and(eq(schema.agentProfiles.tenantId, tenantId), eq(schema.agentProfiles.isDefault, true))
    )
    .limit(1);

  if (!agent) {
    await db.insert(schema.agentProfiles).values({
      tenantId,
      name: "donna",
      displayName: "Donna",
      systemPrompt: "",
      isDefault: true,
      isActive: true,
    });
  }

  const [owner] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.users.id))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .where(and(eq(schema.tenants.slug, FROM_SLUG), eq(schema.memberships.role, "owner")))
    .limit(1);

  if (!owner) {
    return { ok: false, error: `Nenhum owner em ${FROM_SLUG}` };
  }

  const [existingMembership] = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.userId, owner.id))
    )
    .limit(1);

  if (existingMembership) {
    await db
      .update(schema.memberships)
      .set({ role: "owner", updatedAt: new Date() })
      .where(eq(schema.memberships.id, existingMembership.id));
  } else {
    await db.insert(schema.memberships).values({
      tenantId,
      userId: owner.id,
      role: "owner",
    });
  }

  await db
    .update(schema.tenants)
    .set({ status: "active", planCode: "network", updatedAt: new Date() })
    .where(eq(schema.tenants.id, tenantId));

  return { ok: true, ownerEmail: owner.email };
}
