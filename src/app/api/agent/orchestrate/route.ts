import { NextResponse } from "next/server";
import { runOrchestrator } from "@/server/agent";
import { assertAgentServiceToken, readBearerToken } from "@/server/agent/auth";

export const dynamic = "force-dynamic";

type Body = {
  tenantId?: string;
  conversationId?: string;
  phoneE164?: string;
  text?: string;
  mode?: "ai" | "human";
};

/**
 * Entrada do orquestrador (Evolution/n8n → app).
 * Scaffold 6.0: valida token, roda heurística + get_unit_context.
 * Fase 6.2: normaliza payload Evolution e persiste messages.
 */
export async function POST(request: Request) {
  try {
    assertAgentServiceToken(readBearerToken(request.headers.get("authorization")));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tenantId = body.tenantId?.trim();
  const conversationId = body.conversationId?.trim();
  const phoneE164 = body.phoneE164?.trim();
  const text = body.text?.trim();

  if (!tenantId || !conversationId || !phoneE164 || !text) {
    return NextResponse.json(
      { error: "tenantId, conversationId, phoneE164 e text são obrigatórios" },
      { status: 400 }
    );
  }

  const result = await runOrchestrator({
    tenantId,
    conversationId,
    phoneE164,
    userText: text,
    mode: body.mode === "human" ? "human" : "ai",
  });

  return NextResponse.json(result);
}
