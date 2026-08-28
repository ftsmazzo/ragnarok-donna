import { NextResponse } from "next/server";
import { isAppError, switchActiveBranch } from "@/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { branchSlug?: string };
    if (!body.branchSlug) {
      return NextResponse.json({ error: "Unidade obrigatória" }, { status: 400 });
    }

    const session = await switchActiveBranch(body.branchSlug);
    return NextResponse.json({
      ok: true,
      branch: session.branch?.slug ?? null,
    });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[auth/switch-branch]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
