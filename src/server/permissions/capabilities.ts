import type { MemberRole } from "../types";
import { isBarberRole, isOwnerRole, isReceptionRole } from "./roles";

/** Capacidades de negócio — use em server actions e services. */
export type Capability =
  | "clients.read"
  | "clients.write"
  | "staff.read"
  | "staff.write"
  | "catalog.read"
  | "catalog.write"
  | "orders.read"
  | "orders.write"
  | "appointments.read"
  | "appointments.write"
  | "appointments.cancel"
  | "appointments.status_own"
  | "cash.read"
  | "cash.write"
  | "commissions.read_all"
  | "commissions.read_own"
  | "commissions.write"
  | "reports.operational"
  | "reports.management"
  | "conversations.read"
  | "conversations.write"
  | "settings.read"
  | "settings.write"
  | "members.manage";

const OWNER: Capability[] = [
  "clients.read",
  "clients.write",
  "staff.read",
  "staff.write",
  "catalog.read",
  "catalog.write",
  "orders.read",
  "orders.write",
  "appointments.read",
  "appointments.write",
  "appointments.cancel",
  "cash.read",
  "cash.write",
  "commissions.read_all",
  "commissions.read_own",
  "commissions.write",
  "reports.operational",
  "reports.management",
  "conversations.read",
  "conversations.write",
  "settings.read",
  "settings.write",
  "members.manage",
];

const RECEPTION: Capability[] = [
  "clients.read",
  "clients.write",
  "orders.read",
  "orders.write",
  "appointments.read",
  "appointments.write",
  "appointments.cancel",
  "cash.read",
  "cash.write",
  "commissions.read_all",
  "commissions.write",
  "reports.operational",
  "conversations.read",
  "conversations.write",
];

const BARBER: Capability[] = [
  "appointments.read",
  "appointments.status_own",
  "orders.read",
  "commissions.read_own",
  "staff.read",
];

const READONLY: Capability[] = [
  "clients.read",
  "appointments.read",
  "orders.read",
  "reports.operational",
];

const BY_ROLE: Record<MemberRole, Capability[]> = {
  owner: OWNER,
  admin: OWNER,
  manager: RECEPTION,
  staff: BARBER,
  readonly: READONLY,
};

export function hasCapability(role: MemberRole, cap: Capability): boolean {
  return BY_ROLE[role]?.includes(cap) ?? false;
}

export function assertCapability(role: MemberRole, cap: Capability): void {
  if (!hasCapability(role, cap)) {
    throw new Error("FORBIDDEN");
  }
}

/** Pode ver comissões de todos ou só as próprias. */
export function commissionsScope(role: MemberRole): "all" | "own" | "none" {
  if (hasCapability(role, "commissions.read_all")) return "all";
  if (hasCapability(role, "commissions.read_own")) return "own";
  return "none";
}

export function canManageMembers(role: MemberRole): boolean {
  return hasCapability(role, "members.manage");
}

export function canWriteClients(role: MemberRole): boolean {
  return hasCapability(role, "clients.write");
}

export function canWriteStaff(role: MemberRole): boolean {
  return hasCapability(role, "staff.write");
}

export function canUseConversations(role: MemberRole): boolean {
  return hasCapability(role, "conversations.read");
}

export function isScopedBarber(role: MemberRole): boolean {
  return isBarberRole(role);
}

export function isOperationalReception(role: MemberRole): boolean {
  return isReceptionRole(role);
}

export function isFullAdmin(role: MemberRole): boolean {
  return isOwnerRole(role);
}
