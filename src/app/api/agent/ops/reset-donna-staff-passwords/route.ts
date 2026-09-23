import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { hashPassword } from "@/server/auth/password";

export const dynamic = "force-dynamic";

/**
 * Redefine senha dos profissionais (role=staff) da Donna Elegant (U01+U02).
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 * Body: { "password": "donna12345", "slug"?: "donna-elegant" }
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  const expected = [
    process.env.AUTH_SECRET?.trim(),
    process.env.EVOLUTION_API_KEY?.trim(),
    process.env.AGENT_SERVICE_TOKEN?.trim(),
  ].filter(Boolean);
  if (!auth || !expected.includes(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let password = "";
  let slug = "donna-elegant";
  try {
    const body = (await request.json()) as { password?: string; slug?: string };
    if (body.password?.trim()) password = body.password.trim();
    if (body.slug?.trim()) slug = body.slug.trim();
  } catch {
    return NextResponse.json({ error: "Body JSON obrigatório com password" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Senha deve ter no mínimo 8 caracteres" }, { status: 400 });
  }

  const db = createDb();
  const [tenant] = await db
    .select({ id: schema.tenants.id, name: schema.tenants.name, slug: schema.tenants.slug })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);

  if (!tenant) {
    return NextResponse.json({ error: `Tenant ${slug} não encontrado` }, { status: 404 });
  }

  const members = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.tenantId, tenant.id), eq(schema.memberships.role, "staff")));

  if (!members.length) {
    return NextResponse.json({
      ok: true,
      updated: 0,
      slug: tenant.slug,
      message: "Nenhum profissional (staff) encontrado",
    });
  }

  const passwordHash = await hashPassword(password);
  const userIds = members.map((m) => m.userId);

  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(inArray(schema.users.id, userIds));

  return NextResponse.json({
    ok: true,
    updated: members.length,
    slug: tenant.slug,
    name: tenant.name,
    emails: members.map((m) => m.email),
  });
}
