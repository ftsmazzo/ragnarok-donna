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

/** Payload da sessão autenticada (JWT + contexto de execução). */
export type AppSession = {
  user: SessionUser;
  tenant: SessionTenant;
  role: MemberRole;
  /** Profissional vinculado — barbeiro (staff). */
  staffId?: string | null;
};

export type TenantContext = SessionTenant & {
  timezone: string;
  currency: string;
};
