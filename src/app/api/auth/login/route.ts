import { NextResponse } from "next/server";
import { isAppError, login } from "@/server";
import { enforceRateLimit } from "@/server/security/rate-limit";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "auth.login", 12, 15 * 60_000);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      tenantSlug?: string;
    };

    const result = await login({
      email: body.email ?? "",
      password: body.password ?? "",
      tenantSlug: body.tenantSlug,
    });

    if (result.status === "pick_tenant") {
      return NextResponse.json({
        needsTenantPick: true,
        tenants: result.tenants,
      });
    }

    return NextResponse.json({
      ok: true,
      tenant: result.session.tenant.slug,
      branch: result.session.branch?.slug ?? null,
    });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
