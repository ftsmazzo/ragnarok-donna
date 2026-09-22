"use server";

import { revalidatePath } from "next/cache";
import { saveOutreachSettings } from "@/server/outreach/settings";
import type { OutreachSettingsView } from "@/server/outreach/defaults";

export async function saveOutreachSettingsAction(
  input: Partial<OutreachSettingsView> & {
    customClosedDatesText?: string;
    followupMonthDaysText?: string;
    templateConfirmationVariantsText?: string;
    templateFollowup30VariantsText?: string;
    templateFollowup60VariantsText?: string;
    templateSundayBlastVariantsText?: string;
    templateEmptyAgendaVariantsText?: string;
    templateBirthdayVariantsText?: string;
  }
) {
  const result = await saveOutreachSettings(input);
  if (result.ok) revalidatePath("/configuracoes/disparos");
  return result;
}
