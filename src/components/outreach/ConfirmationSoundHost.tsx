import { ConfirmationSoundWatcher } from "@/components/outreach/ConfirmationSoundWatcher";
import { getOutreachSettingsForTenant } from "@/server/outreach/settings";
import { requireSession } from "@/server/context/tenant";

export async function ConfirmationSoundHost() {
  const session = await requireSession();
  const settings = await getOutreachSettingsForTenant(session.tenant.id);
  if (!settings.soundOnConfirmEnabled) return null;
  return <ConfirmationSoundWatcher enabled />;
}
