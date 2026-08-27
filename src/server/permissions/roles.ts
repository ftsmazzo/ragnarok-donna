import type { MemberRole } from "../types";

/** Rótulos exibidos na UI (negócio). */
export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  manager: "Recepção",
  staff: "Barbeiro",
  readonly: "Somente leitura",
};

export function roleLabel(role: MemberRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function isOwnerRole(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

/** Recepção — operação do dia + conversas IA. */
export function isReceptionRole(role: MemberRole): boolean {
  return role === "manager";
}

/** Barbeiro — escopo do próprio profissional. */
export function isBarberRole(role: MemberRole): boolean {
  return role === "staff";
}

/** Dono, admin ou recepção — visão operacional/gestão parcial. */
export function isManagementRole(role: MemberRole): boolean {
  return isOwnerRole(role) || isReceptionRole(role);
}

/** Métricas sensíveis (cancelamento etc.) — só dono/admin. */
export function isOwnerOnlyInsights(role: MemberRole): boolean {
  return isOwnerRole(role);
}
