import type { AppSession, MemberRole } from "../types";
import { ForbiddenError } from "../errors";
import { hasCapability, type Capability } from "./capabilities";

export function requireCapability(session: AppSession, cap: Capability): void {
  if (!hasCapability(session.role, cap)) {
    throw new ForbiddenError();
  }
}

/** Guarda mínima de papéis — compatível com código existente. */
export function requireRole(session: AppSession, allowed: MemberRole[]): void {
  if (!allowed.includes(session.role)) {
    throw new ForbiddenError();
  }
}
