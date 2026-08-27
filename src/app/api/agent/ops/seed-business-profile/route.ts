import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { ensureBusinessProfile } from "@/server/agent/ensure-business-profile";

export const dynamic = "force-dynamic";

/**
 * Aplica perfil institucional Ragnarok (site) no tenant.
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 * Body: { "slug"?: "ragnaroks", "force"?: true }
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

  let slug = "ragnaroks";
  let force = true;
  try {
    const body = (await request.json()) as { slug?: string; force?: boolean };
    if (body.slug?.trim()) slug = body.slug.trim();
    if (typeof body.force === "boolean") force = body.force;
  } catch {
    // body opcional
  }

  const db = createDb();
  const [tenant] = await db
    .select({ id: schema.tenants.id, name: schema.tenants.name })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 });
  }

  const result = await ensureBusinessProfile({ tenantId: tenant.id, force });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    slug,
    applied: result.applied,
    nome: result.profile.nomeFantasia,
    endereco: result.profile.endereco.textoCompleto,
    logoUrl: result.profile.brand.logoUrl,
    fonts: result.profile.brand.fonts,
    colors: result.profile.brand.colors,
  });
}
