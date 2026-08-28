import { NextResponse } from "next/server";
import { changeOwnPassword, isAppError } from "@/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const result = await changeOwnPassword({
      currentPassword: body.currentPassword ?? "",
      newPassword: body.newPassword ?? "",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[auth/change-password]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
