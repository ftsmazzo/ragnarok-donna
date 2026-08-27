import { NextResponse } from "next/server";
import { assertWebhookAuthorized, handleEvolutionWebhook } from "@/server/agent/inbound";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Webhook Evolution → Donna (MESSAGES_UPSERT, CONNECTION_UPDATE). */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    assertWebhookAuthorized(request, body);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await handleEvolutionWebhook(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "donna-webhook" });
}
