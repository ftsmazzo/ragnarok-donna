import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/constants";
import { readSessionFromToken } from "@/server/auth/session";
import {
  barberNeedsStaffLink,
  canAccessRoute,
  defaultRouteForRole,
} from "@/server/permissions/routes";
import { isBarberRole } from "@/server/permissions/roles";

const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/agent"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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

  const normalized = pathname === "/" ? "/inicio" : pathname;

  if (isBarberRole(session.role) && normalized === "/profissionais" && !searchParams.get("id")) {
    if (session.staffId) {
      const url = request.nextUrl.clone();
      url.searchParams.set("id", session.staffId);
      return NextResponse.redirect(url);
    }
  }

  if (barberNeedsStaffLink(normalized, session.role, session.staffId)) {
    const url = new URL("/inicio", request.url);
    url.searchParams.set("aviso", "vinculo-profissional");
    return NextResponse.redirect(url);
  }

  const allowed = canAccessRoute(normalized, session.role, {
    staffId: session.staffId,
    queryStaffId: searchParams.get("id"),
  });

  if (!allowed) {
    const fallback = defaultRouteForRole(session.role, session.staffId);
    const url = new URL(fallback, request.url);
    url.searchParams.set("acesso", "negado");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
