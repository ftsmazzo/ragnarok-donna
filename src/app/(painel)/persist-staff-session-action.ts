"use server";

import { setSessionCookie } from "@/server/auth/session";
import { requireSession } from "@/server/context/tenant";
import { isBarberRole } from "@/server/permissions/roles";
import { getStaffIdForUser } from "@/server/permissions/staff-scope";

/** Persiste staffId no cookie (só via Server Action — seguro no Next). */
export async function persistStaffSessionAction(): Promise<{ ok: boolean }> {
  try {
    const session = await requireSession();
    if (!isBarberRole(session.role) || session.staffId) return { ok: true };
    const staffId = await getStaffIdForUser(session.tenant.id, session.user.id);
    if (!staffId) return { ok: false };
    await setSessionCookie({ ...session, staffId });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
