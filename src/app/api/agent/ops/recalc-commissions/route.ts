import { NextResponse } from "next/server";
import { createDb, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { recalcPeriodCatalogCommissions } from "@/server/commissions/house";
import { monthStartSp, todaySp } from "@/lib/datetime";

export const dynamic = "force-dynamic";

/**
 * Recalcula comissões de itens já lançados (fechados/abertos) a partir do catálogo.
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 * Body: { slug, from?, to?, branchSlug? }
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
    const expected = [
      process.env.AUTH_SECRET?.trim(),
      process.env.EVOLUTION_API_KEY?.trim(),
      process.env.AGENT_SERVICE_TOKEN?.trim(),
    ].filter(Boolean);
    if (!auth || !expected.includes(auth)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { slug?: string; from?: string; to?: string; branchSlug?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // optional
    }

    const slug = body.slug?.trim();
    if (!slug) {
      return NextResponse.json({ error: "slug obrigatório" }, { status: 400 });
    }

    const from = body.from?.trim() || monthStartSp();
    const to = body.to?.trim() || todaySp();
    const branchSlug = body.branchSlug?.trim() || null;

    const db = createDb();
    const [tenant] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);
    if (!tenant) {
      return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
    }

    let branchId: string | null = null;
    if (branchSlug) {
      const [branch] = await db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(eq(schema.branches.tenantId, tenant.id), eq(schema.branches.slug, branchSlug))
        )
        .limit(1);
      if (!branch) {
        return NextResponse.json({ error: "unidade não encontrada" }, { status: 404 });
      }
      branchId = branch.id;
    }

    const result = await recalcPeriodCatalogCommissions({
      tenantId: tenant.id,
      from,
      to,
      branchId,
    });

    return NextResponse.json({
      ok: true,
      slug,
      from,
      to,
      branchSlug: branchSlug ?? "all",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ops/recalc-commissions]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
