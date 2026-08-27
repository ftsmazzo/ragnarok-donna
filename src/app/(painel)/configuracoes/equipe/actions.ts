"use server";

import { revalidatePath } from "next/cache";
import { linkStaffToUser, updateMemberRole } from "@/server/members";
import type { MemberRole } from "@/server/types";

export async function updateMemberRoleAction(membershipId: string, role: MemberRole) {
  const result = await updateMemberRole(membershipId, role);
  if (result.ok) {
    revalidatePath("/configuracoes/equipe");
  }
  return result;
}

export async function linkStaffAction(membershipId: string, staffId: string) {
  const result = await linkStaffToUser(membershipId, staffId || null);
  if (result.ok) {
    revalidatePath("/configuracoes/equipe");
  }
  return result;
}
