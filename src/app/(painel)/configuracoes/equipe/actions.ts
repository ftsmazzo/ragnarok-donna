"use server";

import { revalidatePath } from "next/cache";
import {
  bulkProvisionStaffAccess,
  inviteMember,
  linkStaffToUser,
  provisionStaffAccess,
  updateMemberBranch,
  updateMemberRole,
  type InviteMemberInput,
  type ProvisionStaffInput,
} from "@/server/members";
import type { MemberRole } from "@/server/types";

export async function updateMemberRoleAction(membershipId: string, role: MemberRole) {
  const result = await updateMemberRole(membershipId, role);
  if (result.ok) {
    revalidatePath("/configuracoes/equipe");
  }
  return result;
}

export async function updateMemberBranchAction(membershipId: string, branchId: string | null) {
  const result = await updateMemberBranch(membershipId, branchId);
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

export async function inviteMemberAction(input: InviteMemberInput) {
  const result = await inviteMember(input);
  if (result.ok) {
    revalidatePath("/configuracoes/equipe");
  }
  return result;
}

export async function provisionStaffAction(input: ProvisionStaffInput) {
  const result = await provisionStaffAccess(input);
  if (result.ok) {
    revalidatePath("/configuracoes/equipe");
  }
  return result;
}

export async function bulkProvisionStaffAction(sendInviteEmail = true) {
  const result = await bulkProvisionStaffAccess({ sendInviteEmail });
  if (result.ok) {
    revalidatePath("/configuracoes/equipe");
  }
  return result;
}
