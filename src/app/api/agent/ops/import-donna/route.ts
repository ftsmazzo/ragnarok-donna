import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import {
  getDonnaImportStatus,
  spawnDonnaImport,
} from "@/server/tenant/donna-import";

export const dynamic = "force-dynamic";

/**
 * Dispara import AppBeleza → Donna Elegant Unidade 01.
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

  const db = createDb();
  const [tenant] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, "donna-elegant"))
    .limit(1);

  if (!tenant) {
    return NextResponse.json({ error: "Tenant donna-elegant não encontrado." }, { status: 404 });
  }

  const status = await getDonnaImportStatus(tenant.id);
  if (status.importRunning) {
    return NextResponse.json({ ok: true, alreadyRunning: true, status });
  }

  const result = spawnDonnaImport();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}
