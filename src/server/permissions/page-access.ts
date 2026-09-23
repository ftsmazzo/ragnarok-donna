import { redirect } from "next/navigation";
import { requireSession } from "../context/tenant";
import type { AppSession } from "../types";
import {
  barberNeedsStaffLink,
  canAccessRoute,
  defaultRouteForRole,
  type RouteAccessContext,
} from "./routes";
import { hydrateSessionStaffId } from "./staff-scope";

/** Guarda de página — redireciona se rota não permitida. */
export async function requirePageAccess(
  pathname: string,
  searchParams?: Record<string, string | undefined>
): Promise<AppSession> {
  let session = await requireSession();
  session = await hydrateSessionStaffId(session);

  const ctx: RouteAccessContext = {
    staffId: session.staffId,
    queryStaffId: searchParams?.id,
  };

  if (barberNeedsStaffLink(pathname, session.role, session.staffId)) {
    redirect("/inicio?aviso=vinculo-profissional");
  }

  if (!canAccessRoute(pathname, session.role, ctx)) {
    redirect("/inicio?acesso=negado");
  }

  return session;
}

export { defaultRouteForRole };
