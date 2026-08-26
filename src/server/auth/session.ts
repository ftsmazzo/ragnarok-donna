import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { AppSession } from "../types";
import { getAuthSecret, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "./constants";

type SessionPayload = AppSession & { exp?: number };

export async function createSessionToken(session: AppSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getAuthSecret());
}

export async function setSessionCookie(session: AppSession): Promise<void> {
  const token = await createSessionToken(session);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSession(): Promise<AppSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    const { user, tenant, role } = payload as SessionPayload;
    if (!user?.id || !tenant?.id || !role) return null;
    return { user, tenant, role };
  } catch {
    return null;
  }
}

/** Para middleware (edge) — verifica token sem cookies(). */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getAuthSecret());
    return true;
  } catch {
    return false;
  }
}
