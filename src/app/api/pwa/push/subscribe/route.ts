import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createDb, schema } from "@/db";
import { readSession } from "@/server/auth/session";
import { getVapidPublicKey } from "@/server/pwa/web-push";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ ok: false, error: "push_not_configured" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, publicKey });
}

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "invalid_subscription" }, { status: 400 });
  }

  const db = createDb();
  const ua = request.headers.get("user-agent")?.slice(0, 400) ?? null;

  const [existing] = await db
    .select({ id: schema.pushSubscriptions.id })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint))
    .limit(1);

  if (existing) {
    await db
      .update(schema.pushSubscriptions)
      .set({
        tenantId: session.tenant.id,
        userId: session.user.id,
        p256dh,
        auth,
        userAgent: ua,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.pushSubscriptions.id, existing.id));
  } else {
    await db.insert(schema.pushSubscriptions).values({
      tenantId: session.tenant.id,
      userId: session.user.id,
      endpoint,
      p256dh,
      auth,
      userAgent: ua,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: "invalid_subscription" }, { status: 400 });
  }

  const db = createDb();
  await db
    .delete(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint));

  return NextResponse.json({ ok: true });
}
