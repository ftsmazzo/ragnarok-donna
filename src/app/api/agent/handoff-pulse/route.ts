import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createDb, schema } from "@/db";
import { readSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** Pulso para PWA: handoffs novos desde ?since= (ISO). */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sinceRaw = searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 5 * 60_000);
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ ok: false, error: "since inválido" }, { status: 400 });
  }

  const db = createDb();
  const rows = await db
    .select({
      id: schema.conversations.id,
      phoneE164: schema.conversations.phoneE164,
      humanRequestedAt: schema.conversations.humanRequestedAt,
      lastMessageAt: schema.conversations.lastMessageAt,
    })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.tenantId, session.tenant.id),
        eq(schema.conversations.mode, "human"),
        isNotNull(schema.conversations.humanRequestedAt),
        isNull(schema.conversations.humanTakenAt),
        gt(schema.conversations.humanRequestedAt, since)
      )
    )
    .orderBy(desc(schema.conversations.humanRequestedAt))
    .limit(20);

  return NextResponse.json({
    ok: true,
    count: rows.length,
    since: since.toISOString(),
    items: rows.map((r) => ({
      id: r.id,
      phoneE164: r.phoneE164,
      humanRequestedAt: r.humanRequestedAt?.toISOString() ?? null,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
    })),
  });
}
