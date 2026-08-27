import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createDb, schema } from "@/db";
import { readSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** Pulso leve para PWA: conversas em modo humano aguardando. */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
        isNull(schema.conversations.humanTakenAt)
      )
    )
    .orderBy(desc(schema.conversations.humanRequestedAt))
    .limit(20);

  return NextResponse.json({
    ok: true,
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      phoneE164: r.phoneE164,
      humanRequestedAt: r.humanRequestedAt?.toISOString() ?? null,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
    })),
  });
}
