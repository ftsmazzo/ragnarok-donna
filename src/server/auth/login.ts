import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { resolveDefaultBranch } from "../context/branch";
import { UnauthorizedError } from "../errors";
import { getStaffIdForUser } from "../permissions/staff-scope";
import type { AppSession, LoginResult, SessionUser, TenantPickOption } from "../types";
import { verifyPassword } from "./password";
import { setSessionCookie, readSession } from "./session";

export type LoginInput = {
  email: string;
  password: string;
  tenantSlug?: string;
};

type MembershipRow = {
  role: AppSession["role"];
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  branchId: string | null;
};

async function loadUser(email: string) {
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
  return user ?? null;
}

async function loadMemberships(userId: string): Promise<MembershipRow[]> {
  const db = createDb();
  return db
    .select({
      role: schema.memberships.role,
      branchId: schema.memberships.branchId,
      tenantId: schema.tenants.id,
      tenantName: schema.tenants.name,
      tenantSlug: schema.tenants.slug,
      tenantStatus: schema.tenants.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
    .where(and(eq(schema.memberships.userId, userId), isNull(schema.tenants.deletedAt)));
}

function pickMembership(
  memberships: MembershipRow[],
  tenantSlug?: string,
  strict = false
): MembershipRow | null {
  if (!memberships.length) return null;

  if (tenantSlug) {
    const match =
      memberships.find((m) => m.tenantSlug === tenantSlug && m.tenantStatus === "active") ??
      memberships.find((m) => m.tenantSlug === tenantSlug);
    if (match) return match;
    if (strict) return null;
  }

  const preferredSlug = process.env.DEFAULT_TENANT_SLUG;
  if (preferredSlug) {
    const match =
      memberships.find((m) => m.tenantSlug === preferredSlug && m.tenantStatus === "active") ??
      memberships.find((m) => m.tenantSlug === preferredSlug);
    if (match) return match;
  }

  return (
    memberships.find((m) => m.tenantStatus === "active") ??
    memberships.find((m) => m.tenantStatus === "trialing") ??
    memberships[0]
  );
}

async function buildSession(user: SessionUser, membership: MembershipRow): Promise<AppSession> {
  if (membership.tenantStatus !== "active" && membership.tenantStatus !== "trialing") {
    throw new UnauthorizedError("Organização inativa ou suspensa");
  }

  let staffId: string | null = null;
  if (membership.role === "staff") {
    staffId = await getStaffIdForUser(membership.tenantId, user.id);
  }

  const branch = await resolveDefaultBranch(membership.tenantId, membership.branchId);

  return {
    user,
    tenant: {
      id: membership.tenantId,
      name: membership.tenantName,
      slug: membership.tenantSlug,
    },
    branch,
    branchView: "unit",
    role: membership.role,
    staffId,
  };
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    throw new UnauthorizedError("E-mail e senha são obrigatórios");
  }

  const user = await loadUser(email);
  if (!user) {
    throw new UnauthorizedError("Credenciais inválidas");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedError("Credenciais inválidas");
  }

  const memberships = await loadMemberships(user.id);
  if (!memberships.length) {
    throw new UnauthorizedError("Usuário sem acesso a nenhuma organização");
  }

  const activeMemberships = memberships.filter(
    (m) => m.tenantStatus === "active" || m.tenantStatus === "trialing"
  );

  if (!input.tenantSlug && activeMemberships.length > 1) {
    const tenants: TenantPickOption[] = activeMemberships.map((m) => ({
      slug: m.tenantSlug,
      name: m.tenantName,
    }));
    return { status: "pick_tenant", tenants };
  }

  const membership = pickMembership(
    activeMemberships.length ? activeMemberships : memberships,
    input.tenantSlug,
    Boolean(input.tenantSlug)
  );
  if (!membership) {
    throw new UnauthorizedError(
      input.tenantSlug
        ? "Seu usuário ainda não tem acesso a esta marca. Aguarde o deploy concluir ou fale com o suporte."
        : "Organização não encontrada"
    );
  }

  const session = await buildSession(
    { id: user.id, name: user.name, email: user.email },
    membership
  );

  await setSessionCookie(session);
  return { status: "ok", session };
}

export async function switchTenant(tenantSlug: string): Promise<AppSession> {
  const current = await readSession();
  if (!current) {
    throw new UnauthorizedError();
  }

  const memberships = await loadMemberships(current.user.id);
  const membership = memberships.find((m) => m.tenantSlug === tenantSlug);
  if (!membership) {
    throw new UnauthorizedError("Sem acesso a esta organização");
  }

  const session = await buildSession(current.user, membership);
  await setSessionCookie(session);
  return session;
}

export async function logout(): Promise<void> {
  const { clearSessionCookie } = await import("./session");
  await clearSessionCookie();
}
