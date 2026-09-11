"use server";

import { revalidatePath } from "next/cache";
import { saveOutreachSettings } from "@/server/outreach/settings";
import type { OutreachSettingsView } from "@/server/outreach/defaults";

export async function saveOutreachSettingsAction(
  input: Partial<OutreachSettingsView> & {
    customClosedDatesText?: string;
    followupMonthDaysText?: string;
  }
) {
  const result = await saveOutreachSettings(input);
  if (result.ok) revalidatePath("/configuracoes/disparos");
  return result;
}
