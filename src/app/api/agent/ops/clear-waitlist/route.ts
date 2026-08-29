import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { clearWaitlistForTenant } from "@/server/agent/domain-waitlist";

export const dynamic = "force-dynamic";

/**
 * Zera lista de espera (ops). Por padrão limpa Donna + Ragnarok.
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 * Body opcional: { "slug": "donna-elegant" } ou { "all": true }
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

  let slug: string | null = null;
  let all = true;
  try {
    const body = (await request.json()) as { slug?: string; all?: boolean };
    if (body.slug?.trim()) {
      slug = body.slug.trim();
      all = false;
    }
    if (body.all === false && slug) all = false;
  } catch {
    // body opcional → limpa todos
  }

  const db = createDb();
  const tenants = await db
    .select({ id: schema.tenants.id, slug: schema.tenants.slug, name: schema.tenants.name })
    .from(schema.tenants)
    .where(
      slug
        ? eq(schema.tenants.slug, slug)
        : inArray(schema.tenants.slug, ["donna-elegant", "ragnaroks", "donna", "ragnarok"])
    );

  if (!tenants.length) {
    // fallback: todos os tenants
    const allTenants = await db
      .select({ id: schema.tenants.id, slug: schema.tenants.slug, name: schema.tenants.name })
      .from(schema.tenants);
    const results = [];
    for (const t of allTenants) {
      const r = await clearWaitlistForTenant(t.id);
      results.push({ slug: t.slug, name: t.name, deleted: r.deleted });
    }
    return NextResponse.json({ ok: true, results });
  }

  const results = [];
  for (const t of tenants) {
    const r = await clearWaitlistForTenant(t.id);
    results.push({ slug: t.slug, name: t.name, deleted: r.deleted });
  }

  return NextResponse.json({ ok: true, all, results });
}
