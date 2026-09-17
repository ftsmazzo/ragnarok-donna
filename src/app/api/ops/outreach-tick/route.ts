import { NextResponse } from "next/server";
import { isOutreachDispatchEnabled } from "@/server/outreach/kill-switch";
import { runOutreachTick } from "@/server/outreach/tick";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorize(request: Request): boolean {
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  const expected = [
    process.env.CRON_SECRET?.trim(),
    process.env.AUTH_SECRET?.trim(),
    process.env.AGENT_SERVICE_TOKEN?.trim(),
    process.env.EVOLUTION_API_KEY?.trim(),
  ].filter(Boolean);
  return Boolean(auth && expected.includes(auth));
}

/**
 * Cron EasyPanel — planeja + envia lote de outreach_jobs.
 * Auth: Bearer CRON_SECRET | AUTH_SECRET | AGENT_SERVICE_TOKEN | EVOLUTION_API_KEY
 * Query: ?slug=donna-elegant (opcional)
 * Kill switch: OUTREACH_DISPATCH_ENABLED=true (padrão off — não dispara enquanto clientes estão no AppBarber)
 */
async function handle(request: Request) {
  const limited = enforceRateLimit(request, "ops.outreach-tick", 30, 60_000);
  if (limited) return limited;

  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isOutreachDispatchEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "OUTREACH_DISPATCH_ENABLED is off — nenhum disparo (clientes ainda no outro sistema)",
      at: new Date().toISOString(),
      results: [],
    });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  try {
    const results = await runOutreachTick({ tenantSlug: slug });
    return NextResponse.json({ ok: true, at: new Date().toISOString(), results });
  } catch (err) {
    console.error("[outreach-tick]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "tick failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
