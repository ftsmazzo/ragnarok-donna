/** Papéis de membership (espelha member_role no Postgres). */
export type MemberRole = "owner" | "admin" | "manager" | "staff" | "readonly";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type SessionTenant = {
  id: string;
  name: string;
  slug: string;
};

export type SessionBranch = {
  id: string;
  name: string;
  slug: string;
};

/** Payload da sessão autenticada (JWT + contexto de execução). */
export type AppSession = {
  user: SessionUser;
  tenant: SessionTenant;
  /** Unidade/filial ativa dentro do tenant. */
  branch?: SessionBranch | null;
  role: MemberRole;
  /** Profissional vinculado — barbeiro (staff). */
  staffId?: string | null;
  /** unit = uma unidade; consolidated = visão comparativa multi-unidade (dono). */
  branchView?: "unit" | "consolidated";
};

export type TenantPickOption = {
  slug: string;
  name: string;
};

export type LoginResult =
  | { status: "ok"; session: AppSession }
  | { status: "pick_tenant"; tenants: TenantPickOption[] };

export type TenantContext = SessionTenant & {
  timezone: string;
  currency: string;
};
