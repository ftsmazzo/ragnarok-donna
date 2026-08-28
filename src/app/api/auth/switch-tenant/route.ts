import { NextResponse } from "next/server";
import { isAppError, switchTenant } from "@/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tenantSlug?: string };
    if (!body.tenantSlug) {
      return NextResponse.json({ error: "Organização obrigatória" }, { status: 400 });
    }

    const session = await switchTenant(body.tenantSlug);
    return NextResponse.json({
      ok: true,
      tenant: session.tenant.slug,
      branch: session.branch?.slug ?? null,
    });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[auth/switch-tenant]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
