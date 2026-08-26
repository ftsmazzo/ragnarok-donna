import { NextResponse } from "next/server";
import { isAppError, login, logout } from "@/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      tenantSlug?: string;
    };

    const session = await login({
      email: body.email ?? "",
      password: body.password ?? "",
      tenantSlug: body.tenantSlug,
    });

    return NextResponse.json({ ok: true, tenant: session.tenant.slug });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
