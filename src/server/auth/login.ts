import { and, eq, isNull } from "drizzle-orm";
import { createDb } from "@/db";
import { schema } from "@/db";
import { UnauthorizedError } from "../errors";
import type { AppSession } from "../types";
import { verifyPassword } from "./password";
import { setSessionCookie } from "./session";

export type LoginInput = {
  email: string;
  password: string;
  tenantSlug?: string;
};

export async function login(input: LoginInput): Promise<AppSession> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    throw new UnauthorizedError("E-mail e senha são obrigatórios");
  }

  const db = createDb();
  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError("Credenciais inválidas");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedError("Credenciais inválidas");
  }

  const memberships = await db
    .select({
      role: schema.memberships.role,
      tenantId: schema.tenants.id,
      tenantName: schema.tenants.name,
      tenantSlug: schema.tenants.slug,
      tenantStatus: schema.tenants.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
    .where(
      and(
        eq(schema.memberships.userId, user.id),
        isNull(schema.tenants.deletedAt)
      )
    );

  if (!memberships.length) {
    throw new UnauthorizedError("Usuário sem acesso a nenhuma unidade");
  }

  const preferredSlug = input.tenantSlug ?? process.env.DEFAULT_TENANT_SLUG ?? "ragnaroks";
  const membership =
    memberships.find((m) => m.tenantSlug === preferredSlug && m.tenantStatus === "active") ??
    memberships.find((m) => m.tenantSlug === preferredSlug) ??
    memberships.find((m) => m.tenantStatus === "active") ??
    memberships[0];

  if (membership.tenantStatus !== "active" && membership.tenantStatus !== "trialing") {
    throw new UnauthorizedError("Unidade inativa ou suspensa");
  }

  const session: AppSession = {
    user: { id: user.id, name: user.name, email: user.email },
    tenant: {
      id: membership.tenantId,
      name: membership.tenantName,
      slug: membership.tenantSlug,
    },
    role: membership.role,
  };

  await setSessionCookie(session);
  return session;
}

export async function logout(): Promise<void> {
  const { clearSessionCookie } = await import("./session");
  await clearSessionCookie();
}
