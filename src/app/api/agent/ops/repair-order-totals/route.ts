import { NextResponse } from "next/server";
import postgres from "postgres";

export const dynamic = "force-dynamic";

/**
 * Sincroniza orders.total_cents com a soma dos itens (cura saldo R$ 0 com itens).
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 * Body opcional: { "slug"?: "donna-elegant" }
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

  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ error: "DATABASE_URL ausente" }, { status: 500 });
  }

  let slug: string | null = null;
  try {
    const body = (await request.json()) as { slug?: string };
    if (body.slug?.trim()) slug = body.slug.trim();
  } catch {
    // body opcional
  }

  const sql = postgres(url, { max: 1, connect_timeout: 20 });
  try {
    const rows = slug
      ? await sql`
          UPDATE orders o
          SET
            total_cents = coalesce(x.items_sum, 0),
            updated_at = now()
          FROM (
            SELECT oi.order_id, oi.tenant_id, sum(oi.total_cents)::int AS items_sum
            FROM order_items oi
            GROUP BY oi.order_id, oi.tenant_id
          ) x
          JOIN tenants t ON t.id = o.tenant_id
          WHERE o.id = x.order_id
            AND o.tenant_id = x.tenant_id
            AND t.slug = ${slug}
            AND o.status = 'open'
            AND o.deleted_at IS NULL
            AND o.total_cents IS DISTINCT FROM coalesce(x.items_sum, 0)
          RETURNING o.id, o.external_id, o.total_cents
        `
      : await sql`
          UPDATE orders o
          SET
            total_cents = coalesce(x.items_sum, 0),
            updated_at = now()
          FROM (
            SELECT oi.order_id, oi.tenant_id, sum(oi.total_cents)::int AS items_sum
            FROM order_items oi
            GROUP BY oi.order_id, oi.tenant_id
          ) x
          WHERE o.id = x.order_id
            AND o.tenant_id = x.tenant_id
            AND o.status = 'open'
            AND o.deleted_at IS NULL
            AND o.total_cents IS DISTINCT FROM coalesce(x.items_sum, 0)
          RETURNING o.id, o.external_id, o.total_cents
        `;

    return NextResponse.json({
      ok: true,
      fixed: rows.length,
      slug: slug ?? "all",
      sample: rows.slice(0, 30),
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
