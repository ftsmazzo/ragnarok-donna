import { NextResponse } from "next/server";
import { and, count, eq, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { getFallbackModel, getPrimaryModel } from "@/server/agent/llm";

export const dynamic = "force-dynamic";

/**
 * Contagens para estimar custo LLM.
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  const expected = [
    process.env.AUTH_SECRET?.trim(),
    process.env.EVOLUTION_API_KEY?.trim(),
    process.env.AGENT_SERVICE_TOKEN?.trim(),
  ].filter(Boolean);
  if (!auth || !expected.includes(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb();
  const primaryModel = getPrimaryModel();
  const fallbackModel = getFallbackModel();

  const tenants = await db
    .select({ id: schema.tenants.id, slug: schema.tenants.slug, name: schema.tenants.name })
    .from(schema.tenants);

  const [convTotal] = await db.select({ n: count() }).from(schema.conversations);
  const [msgTotal] = await db.select({ n: count() }).from(schema.messages);
  const [msgIn] = await db
    .select({ n: count() })
    .from(schema.messages)
    .where(eq(schema.messages.direction, "inbound"));
  const [msgAi] = await db
    .select({ n: count() })
    .from(schema.messages)
    .where(eq(schema.messages.direction, "outbound_ai"));
  const [toolsTotal] = await db.select({ n: count() }).from(schema.agentToolCalls);

  /** Conversas com pelo menos 1 resposta da Donna */
  const withAi = await db.execute(sql`
    select count(distinct conversation_id)::int as n
    from messages
    where direction = 'outbound_ai'
  `);

  const byTenant = [];
  for (const t of tenants) {
    const [c] = await db
      .select({ n: count() })
      .from(schema.conversations)
      .where(eq(schema.conversations.tenantId, t.id));
    const [ai] = await db
      .select({ n: count() })
      .from(schema.messages)
      .where(
        and(eq(schema.messages.tenantId, t.id), eq(schema.messages.direction, "outbound_ai"))
      );
    byTenant.push({
      slug: t.slug,
      name: t.name,
      conversations: Number(c?.n ?? 0),
      outboundAiMessages: Number(ai?.n ?? 0),
    });
  }

  const conversationsWithAi = Number(
    (withAi as unknown as { n: number }[])?.[0]?.n ??
      (withAi as unknown as { rows?: { n: number }[] })?.rows?.[0]?.n ??
      0
  );

  return NextResponse.json({
    ok: true,
    model: primaryModel,
    primaryModel,
    fallbackModel,
    envLlmModel: process.env.LLM_MODEL?.trim() || null,
    totals: {
      conversations: Number(convTotal?.n ?? 0),
      conversationsWithAiReply: conversationsWithAi,
      messages: Number(msgTotal?.n ?? 0),
      inbound: Number(msgIn?.n ?? 0),
      outboundAi: Number(msgAi?.n ?? 0),
      toolCalls: Number(toolsTotal?.n ?? 0),
    },
    byTenant,
    note: "conversationsWithAiReply = threads que tiveram resposta da Donna (melhor proxy de 'conversa paga'). primaryModel=Haiku; fallback=Sonnet se Haiku falhar.",
  });
}
