import { NextResponse, type NextRequest } from "next/server";
import { homePathForUserAgent, isPhoneUserAgent, isTabletUserAgent } from "@/lib/device";
import { SESSION_COOKIE } from "@/server/auth/constants";
import { readSessionFromToken } from "@/server/auth/session";
import {
  barberNeedsStaffLink,
  canAccessRoute,
  defaultRouteForRole,
} from "@/server/permissions/routes";
import { isBarberRole } from "@/server/permissions/roles";
import type { MemberRole } from "@/server/types";

const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/agent"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function deviceHome(request: NextRequest, role: MemberRole, staffId?: string | null): string {
  const ua = request.headers.get("user-agent");
  if (isBarberRole(role) && (isPhoneUserAgent(ua) || isTabletUserAgent(ua))) {
    return "/agenda?modo=tablet";
  }
  const path = homePathForUserAgent(ua, role);
  if (path === "/pwa/conversas" && !canAccessRoute("/pwa/conversas", role, { staffId })) {
    return "/agenda?modo=tablet";
  }
  return path;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSessionFromToken(token) : null;

  if (!session) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") {
      login.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(login);
  }

  const ua = request.headers.get("user-agent");
  const normalized = pathname === "/" ? "/inicio" : pathname;
  const mobileLike = isPhoneUserAgent(ua) || isTabletUserAgent(ua);

  // Celular/tablet: / e /inicio → modo resumido (sem menu desktop).
  // Escape: ?painel=1 mantém o Início completo.
  if (
    (normalized === "/inicio" || pathname === "/") &&
    searchParams.get("painel") !== "1" &&
    mobileLike
  ) {
    const dest = deviceHome(request, session.role, session.staffId);
    if (dest !== "/inicio") {
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  // Conversas do painel no celular → PWA (lista/chat usável)
  if (
    mobileLike &&
    normalized === "/conversas" &&
    canAccessRoute("/pwa/conversas", session.role, { staffId: session.staffId })
  ) {
    const url = new URL("/pwa/conversas", request.url);
    searchParams.forEach((v, k) => url.searchParams.set(k, v));
    return NextResponse.redirect(url);
  }

  if (isBarberRole(session.role) && normalized === "/profissionais" && !searchParams.get("id")) {
    if (session.staffId) {
      const url = request.nextUrl.clone();
      url.searchParams.set("id", session.staffId);
      return NextResponse.redirect(url);
    }
  }

  if (barberNeedsStaffLink(normalized, session.role, session.staffId)) {
    const url = new URL(deviceHome(request, session.role, session.staffId), request.url);
    url.searchParams.set("aviso", "vinculo-profissional");
    return NextResponse.redirect(url);
  }

  const allowed = canAccessRoute(normalized, session.role, {
    staffId: session.staffId,
    queryStaffId: searchParams.get("id"),
  });

  if (!allowed) {
    // No celular, nunca devolve para /inicio (isso reabre o redirect e vira loop).
    const dest = mobileLike
      ? "/agenda?modo=tablet"
      : defaultRouteForRole(session.role, session.staffId);
    const url = new URL(dest, request.url);
    url.searchParams.set("acesso", "negado");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
