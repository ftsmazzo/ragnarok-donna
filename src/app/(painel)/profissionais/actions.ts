"use server";

import {
  createStaffMember,
  deactivateStaffMember,
  reactivateStaffMember,
  saveStaffSchedules,
  updateStaffMember,
  type ActionResult,
  type ScheduleSlotInput,
} from "@/server/staff/mutations";

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
  return saveStaffSchedules(staffId, slots);
}

export async function deactivateStaffAction(staffId: string): Promise<ActionResult> {
  return deactivateStaffMember(staffId);
}

export async function reactivateStaffAction(staffId: string): Promise<ActionResult> {
  return reactivateStaffMember(staffId);
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
