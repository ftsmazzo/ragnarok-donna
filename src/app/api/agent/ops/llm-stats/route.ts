import { NextResponse } from "next/server";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { getFallbackModel, getPrimaryModel } from "@/server/agent/llm";
import { PREMIUM_ACCEPTANCE } from "@/server/agent/brain-policy";

export const dynamic = "force-dynamic";

/**
 * Contagens para custo LLM + saúde do cérebro operacional.
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 *
 * Query: ?days=7 (padrão 14) &tenant=ragnaroks (opcional)
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

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 14)));
  const tenantSlug = url.searchParams.get("tenant")?.trim() || null;
  const since = new Date(Date.now() - days * 86400000);

  const db = createDb();
  const primaryModel = getPrimaryModel();
  const fallbackModel = getFallbackModel();

  const tenants = await db
    .select({ id: schema.tenants.id, slug: schema.tenants.slug, name: schema.tenants.name })
    .from(schema.tenants);

  const focus = tenantSlug
    ? tenants.filter((t) => t.slug === tenantSlug)
    : tenants;

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

  const withAi = await db.execute(sql`
    select count(distinct conversation_id)::int as n
    from messages
    where direction = 'outbound_ai'
  `);

  const byTenant = [];
  for (const t of focus) {
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

    const toolRows = await db
      .select({
        toolName: schema.agentToolCalls.toolName,
        status: schema.agentToolCalls.status,
        n: count(),
      })
      .from(schema.agentToolCalls)
      .where(
        and(
          eq(schema.agentToolCalls.tenantId, t.id),
          gte(schema.agentToolCalls.createdAt, since)
        )
      )
      .groupBy(schema.agentToolCalls.toolName, schema.agentToolCalls.status);

    const toolsOk = toolRows
      .filter((r) => r.status === "ok")
      .reduce((a, r) => a + Number(r.n), 0);
    const toolsErr = toolRows
      .filter((r) => r.status === "error")
      .reduce((a, r) => a + Number(r.n), 0);
    const waitlistCalls = toolRows
      .filter((r) => r.toolName === "add_to_waitlist" || r.toolName === "list_waitlist")
      .reduce((a, r) => a + Number(r.n), 0);
    const bookErr = toolRows
      .filter((r) => r.toolName === "book_appointment" && r.status === "error")
      .reduce((a, r) => a + Number(r.n), 0);
    const rescheduleOk = toolRows
      .filter((r) => r.toolName === "reschedule_appointment" && r.status === "ok")
      .reduce((a, r) => a + Number(r.n), 0);

    const [handoffs] = await db
      .select({ n: count() })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.tenantId, t.id),
          eq(schema.conversations.mode, "human"),
          gte(schema.conversations.updatedAt, since)
        )
      );

    const [longAi] = await db
      .select({ n: count() })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.tenantId, t.id),
          eq(schema.messages.direction, "outbound_ai"),
          gte(schema.messages.createdAt, since),
          sql`length(${schema.messages.body}) > 420`
        )
      );

    byTenant.push({
      slug: t.slug,
      name: t.name,
      conversations: Number(c?.n ?? 0),
      outboundAiMessages: Number(ai?.n ?? 0),
      windowDays: days,
      brain: {
        toolsOk,
        toolsErr,
        toolErrorRate:
          toolsOk + toolsErr > 0
            ? Number((toolsErr / (toolsOk + toolsErr)).toFixed(3))
            : 0,
        waitlistCalls,
        bookErrors: bookErr,
        rescheduleOk,
        handoffsHuman: Number(handoffs?.n ?? 0),
        longAiReplies: Number(longAi?.n ?? 0),
        toolsByName: toolRows.map((r) => ({
          tool: r.toolName,
          status: r.status,
          n: Number(r.n),
        })),
      },
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
    premiumAcceptance: PREMIUM_ACCEPTANCE,
    window: { days, since: since.toISOString(), tenant: tenantSlug },
    totals: {
      conversations: Number(convTotal?.n ?? 0),
      conversationsWithAiReply: conversationsWithAi,
      messages: Number(msgTotal?.n ?? 0),
      inbound: Number(msgIn?.n ?? 0),
      outboundAi: Number(msgAi?.n ?? 0),
      toolCalls: Number(toolsTotal?.n ?? 0),
    },
    byTenant,
    note:
      "brain.* = janela recente (days). Premium: zero inventário de horário, waitlist sempre confirma, remarcação atômica, tom curto. Ver docs/DONNA.md.",
  });
}
