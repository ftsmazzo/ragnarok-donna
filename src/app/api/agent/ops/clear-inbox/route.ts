import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Limpa inbox do tenant (ops / pós-deploy).
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 * Body opcional: { "slug": "ragnaroks" }
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
  try {
    const body = (await request.json()) as { slug?: string };
    if (body.slug?.trim()) slug = body.slug.trim();
  } catch {
    // body opcional
  }

  const db = createDb();
  const [tenant] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 });
  }

  const msgCount = await db
    .delete(schema.messages)
    .where(eq(schema.messages.tenantId, tenant.id))
    .returning({ id: schema.messages.id });
  await db
    .delete(schema.agentToolCalls)
    .where(eq(schema.agentToolCalls.tenantId, tenant.id));
  const convCount = await db
    .delete(schema.conversations)
    .where(eq(schema.conversations.tenantId, tenant.id))
    .returning({ id: schema.conversations.id });

  return NextResponse.json({
    ok: true,
    slug,
    conversations: convCount.length,
    messages: msgCount.length,
  });
}
