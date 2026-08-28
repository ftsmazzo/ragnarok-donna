import { NextResponse } from "next/server";
import { ensureDonnaElegantAccess } from "@/server/tenant/ensure-donna-access";

export const dynamic = "force-dynamic";

/**
 * Garante tenant Donna Elegant + owner (mesmo da Ragnarok).
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
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

  void request;
  const result = await ensureDonnaElegantAccess();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ownerEmail: result.ownerEmail });
}
