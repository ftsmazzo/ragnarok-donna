import type { MemberRole } from "../types";
import { isBarberRole, isOwnerRole, isReceptionRole } from "./roles";

export type RouteAccessContext = {
  staffId?: string | null;
  /** ?id= na URL (ficha de profissional). */
  queryStaffId?: string | null;
};

type RouteRule = {
  /** Caminho exato ou prefixo (termina com *). */
  pattern: string;
  roles: MemberRole[];
  /** Barbeiro: exige ?id= próprio ou staffId na sessão. */
  barberOwnStaffOnly?: boolean;
};

/**
 * Matriz de rotas — ordem importa (primeira regra que casa vence).
 * Dono/admin: fallback total no final.
 */
const RULES: RouteRule[] = [
  { pattern: "/inicio", roles: ["owner", "admin", "manager", "staff", "readonly"] },
  { pattern: "/agenda", roles: ["owner", "admin", "manager", "staff", "readonly"] },

  { pattern: "/clientes", roles: ["owner", "admin", "manager", "readonly"] },
  {
    pattern: "/profissionais",
    roles: ["owner", "admin", "staff"],
    barberOwnStaffOnly: true,
  },
  {
    pattern: "/servicos",
    roles: ["owner", "admin"],
  },
  { pattern: "/produtos", roles: ["owner", "admin"] },
  { pattern: "/pacotes", roles: ["owner", "admin"] },

  { pattern: "/comandas", roles: ["owner", "admin", "manager", "staff"] },
  { pattern: "/comandas/historico", roles: ["owner", "admin", "manager", "staff"] },

  { pattern: "/caixa", roles: ["owner", "admin", "manager"] },
  {
    pattern: "/comissoes",
    roles: ["owner", "admin", "manager", "staff"],
  },

  { pattern: "/modulo/fluxo-caixa", roles: ["owner", "admin"] },
  { pattern: "/modulo/contas", roles: ["owner", "admin"] },
  { pattern: "/contas", roles: ["owner", "admin"] },
  { pattern: "/modulo/clube", roles: ["owner", "admin"] },
  { pattern: "/modulo/mensagens", roles: ["owner", "admin"] },
  { pattern: "/modulo/pesquisa", roles: ["owner", "admin"] },
  { pattern: "/modulo/rodizio", roles: ["owner", "admin"] },
  { pattern: "/modulo/funcionamento", roles: ["owner", "admin"] },
  { pattern: "/modulo/alertas", roles: ["owner", "admin"] },
  { pattern: "/modulo/anamnese", roles: ["owner", "admin"] },

  { pattern: "/relatorios/agendamentos", roles: ["owner", "admin", "manager", "readonly"] },
  { pattern: "/relatorios/financeiro", roles: ["owner", "admin"] },
  { pattern: "/relatorios/comandas", roles: ["owner", "admin"] },
  { pattern: "/relatorios/estoque", roles: ["owner", "admin"] },
  { pattern: "/relatorios/fluxo", roles: ["owner", "admin"] },
  { pattern: "/relatorios/perfil", roles: ["owner", "admin", "manager"] },
  { pattern: "/relatorios", roles: ["owner", "admin", "manager", "readonly"] },
  { pattern: "/alertas", roles: ["owner", "admin", "manager"] },

  /** Recepção + dono — handoff n8n / WhatsApp. */
  { pattern: "/conversas", roles: ["owner", "admin", "manager"] },

  { pattern: "/lista-espera", roles: ["owner", "admin", "manager"] },
  { pattern: "/configuracoes/equipe", roles: ["owner", "admin"] },
  { pattern: "/configuracoes/conta", roles: ["owner", "admin", "manager", "staff", "readonly"] },
  { pattern: "/configuracoes/agente", roles: ["owner", "admin"] },
  { pattern: "/configuracoes/empresa", roles: ["owner", "admin"] },
  { pattern: "/configuracoes", roles: ["owner", "admin"] },
  { pattern: "/pwa/conversas", roles: ["owner", "admin", "manager"] },

  /** Módulos genéricos stub — só gestão. */
  { pattern: "/modulo/*", roles: ["owner", "admin"] },
];

function normalizePath(pathname: string): string {
  if (pathname === "/") return "/inicio";
  return pathname.replace(/\/$/, "") || "/inicio";
}

function matchRule(pathname: string): RouteRule | null {
  const path = normalizePath(pathname);
  for (const rule of RULES) {
    if (rule.pattern.endsWith("*")) {
      const prefix = rule.pattern.slice(0, -1);
      if (path.startsWith(prefix)) return rule;
    } else if (path === rule.pattern) {
      return rule;
    }
  }
  return null;
}

export function canAccessRoute(
  pathname: string,
  role: MemberRole,
  ctx: RouteAccessContext = {}
): boolean {
  if (isOwnerRole(role)) return true;

  const rule = matchRule(pathname);
  if (!rule) {
    return false;
  }

  if (!rule.roles.includes(role)) {
    return false;
  }

  if (rule.barberOwnStaffOnly && isBarberRole(role)) {
    const ownId = ctx.staffId;
    if (!ownId) return false;
    const requested = ctx.queryStaffId;
    if (!requested) return true;
    return requested === ownId;
  }

  return true;
}

/** Rota padrão após login ou acesso negado. */
export function defaultRouteForRole(role: MemberRole, staffId?: string | null): string {
  if (isBarberRole(role) && staffId) {
    return `/profissionais?id=${staffId}`;
  }
  return "/inicio";
}

/** Barbeiro sem vínculo staff — só início/agenda/comandas. */
export function barberNeedsStaffLink(pathname: string, role: MemberRole, staffId?: string | null): boolean {
  if (!isBarberRole(role)) return false;
  if (staffId) return false;
  const path = normalizePath(pathname);
  return path === "/profissionais" || path === "/comissoes";
}

export function receptionCanAccess(pathname: string): boolean {
  return canAccessRoute(pathname, "manager");
}
