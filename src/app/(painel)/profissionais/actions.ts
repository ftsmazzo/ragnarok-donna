"use server";

import {
  createStaffMember,
  deactivateStaffMember,
  reactivateStaffMember,
  saveStaffSchedules,
  saveStaffServiceCommissions,
  setStaffClientGoal,
  updateStaffMember,
  type ActionResult,
  type ScheduleSlotInput,
} from "@/server/staff/mutations";
import { revalidatePath } from "next/cache";

export async function createStaffAction(formData: FormData): Promise<ActionResult> {
  return createStaffMember(parseStaffForm(formData));
}

export async function updateStaffAction(
  staffId: string,
  formData: FormData
): Promise<ActionResult> {
  return updateStaffMember(staffId, parseStaffForm(formData));
}

export async function saveStaffSchedulesAction(
  staffId: string,
  formData: FormData
): Promise<ActionResult> {
  const slots: ScheduleSlotInput[] = [];
  for (let wd = 0; wd <= 6; wd++) {
    for (let slot = 1; slot <= 2; slot++) {
      const start = String(formData.get(`wd_${wd}_start_${slot}`) ?? "").trim();
      const end = String(formData.get(`wd_${wd}_end_${slot}`) ?? "").trim();
      if (start || end) {
        slots.push({ weekday: wd, slotIndex: slot, startTime: start, endTime: end });
      }
    }
  }
  const result = await saveStaffSchedules(staffId, slots);
  if (result.ok) {
    revalidatePath("/profissionais");
    revalidatePath("/agenda");
  }
  return result;
}

export async function saveStaffServiceCommissionsAction(
  staffId: string,
  formData: FormData
): Promise<ActionResult> {
  const rows: Array<{ serviceId: string; commissionPct: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("svc_pct_")) continue;
    const serviceId = key.slice("svc_pct_".length);
    rows.push({ serviceId, commissionPct: String(value ?? "") });
  }
  const result = await saveStaffServiceCommissions(staffId, rows);
  if (result.ok) {
    revalidatePath("/profissionais");
  }
  return result;
}

export async function deactivateStaffAction(staffId: string): Promise<ActionResult> {
  return deactivateStaffMember(staffId);
}

export async function reactivateStaffAction(staffId: string): Promise<ActionResult> {
  return reactivateStaffMember(staffId);
}

export async function saveStaffClientGoalAction(
  staffId: string,
  monthlyTargetClients: number | null
): Promise<ActionResult> {
  const result = await setStaffClientGoal(staffId, monthlyTargetClients);
  if (result.ok) {
    revalidatePath("/profissionais");
  }
  return result;
}

function parseStaffForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    color: String(formData.get("color") ?? ""),
    commissionPct: String(formData.get("commissionPct") ?? ""),
    isBookable: formData.get("isBookable") === "on",
    branchId: String(formData.get("branchId") ?? ""),
    avatarUrl: String(formData.get("avatarUrl") ?? ""),
  };
}
