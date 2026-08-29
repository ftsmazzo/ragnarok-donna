import { after, NextResponse } from "next/server";
import { assertWebhookAuthorized, handleEvolutionWebhook } from "@/server/agent/inbound";

export const dynamic = "force-dynamic";
/** Tempo extra se o runtime ainda processar no mesmo request (fallback). */
export const maxDuration = 90;

/**
 * Webhook Evolution → Donna.
 * Responde 200 na hora (Evolution não corta a conexão) e processa a IA em background.
 */
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

  after(async () => {
    try {
      await handleEvolutionWebhook(body);
    } catch (err) {
      console.error("[webhook:after]", err);
    }
  });

  return NextResponse.json({ ok: true, accepted: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "donna-webhook" });
}
