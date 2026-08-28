import { NextResponse } from "next/server";
import { isAppError, login } from "@/server";

export async function POST(request: Request) {
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
