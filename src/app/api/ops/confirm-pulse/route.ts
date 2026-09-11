import { NextResponse } from "next/server";
import { readSession } from "@/server/auth/session";
import { listRecentWhatsAppConfirmations } from "@/server/outreach/confirm";
import { getOutreachSettingsForTenant } from "@/server/outreach/settings";

export const dynamic = "force-dynamic";

/** Pulso: confirmações via WhatsApp desde ?since= (para som no painel/PWA). */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const settings = await getOutreachSettingsForTenant(session.tenant.id);
  if (!settings.soundOnConfirmEnabled) {
    return NextResponse.json({ ok: true, enabled: false, items: [] });
  }

  const { searchParams } = new URL(request.url);
  const sinceRaw = searchParams.get("since");
  const sinceIso = sinceRaw || new Date(Date.now() - 5 * 60_000).toISOString();

  const items = await listRecentWhatsAppConfirmations({
    tenantId: session.tenant.id,
    sinceIso,
  });

  return NextResponse.json({ ok: true, enabled: true, items });
}
