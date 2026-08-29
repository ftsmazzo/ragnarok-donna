/**
 * Alternativas de encaixe quando o horário/profissional pedido não está livre.
 */
import { listFreeSlotsForTenant, type FreeSlot } from "./domain-agenda";
import { shiftDateSp } from "@/lib/datetime";
import { describeDate } from "./temporal";

export type BookingAlternative = {
  kind: "same_day_other_staff" | "same_day_other_hour" | "other_day_same_hour";
  label: string;
  date: string;
  dateLabel: string;
  hour: number;
  staffId: string;
  staffName: string;
};

function slotToAlt(
  kind: BookingAlternative["kind"],
  slot: FreeSlot,
  kindLabel: string
): BookingAlternative {
  const dateInfo = describeDate(slot.date);
  return {
    kind,
    label: `${kindLabel}: ${dateInfo.weekdayShort} ${dateInfo.dateBr} às ${slot.label} com ${slot.staffName}`,
    date: slot.date,
    dateLabel: dateInfo.label,
    hour: slot.hour,
    staffId: slot.staffId,
    staffName: slot.staffName,
  };
}

export async function suggestBookingAlternatives(input: {
  tenantId: string;
  date: string;
  preferredHour: number | null;
  preferredStaffId?: string | null;
  durationMin?: number;
}): Promise<{
  alternatives: BookingAlternative[];
  sameDayOtherStaff: BookingAlternative[];
  sameDayOtherHours: BookingAlternative[];
  otherDaysSameHour: BookingAlternative[];
}> {
  const durationMin = input.durationMin ?? 30;
  const hour = input.preferredHour;
  const staffId = input.preferredStaffId || null;

  const daySlots = await listFreeSlotsForTenant({
    tenantId: input.tenantId,
    date: input.date,
    durationMin,
    limit: 24,
  });

  const sameDayOtherStaff: BookingAlternative[] = [];
  const sameDayOtherHours: BookingAlternative[] = [];

  if (hour != null) {
    for (const s of daySlots) {
      if (s.hour !== hour) continue;
      if (staffId && s.staffId === staffId) continue;
      sameDayOtherStaff.push(
        slotToAlt("same_day_other_staff", s, "Mesmo horário, outro profissional")
      );
      if (sameDayOtherStaff.length >= 2) break;
    }
  }

  const staffDaySlots = staffId
    ? daySlots.filter((s) => s.staffId === staffId)
    : daySlots;
  for (const s of staffDaySlots) {
    if (hour != null && s.hour === hour) continue;
    sameDayOtherHours.push(
      slotToAlt(
        "same_day_other_hour",
        s,
        staffId ? "Outro horário no mesmo dia" : "Outro horário no mesmo dia"
      )
    );
    if (sameDayOtherHours.length >= 3) break;
  }

  const otherDaysSameHour: BookingAlternative[] = [];
  if (hour != null) {
    for (let i = 1; i <= 7 && otherDaysSameHour.length < 2; i += 1) {
      const nextDate = shiftDateSp(input.date, i);
      const slots = await listFreeSlotsForTenant({
        tenantId: input.tenantId,
        date: nextDate,
        durationMin,
        limit: 20,
      });
      const match = staffId
        ? slots.find((s) => s.staffId === staffId && s.hour === hour)
        : slots.find((s) => s.hour === hour);
      if (match) {
        otherDaysSameHour.push(
          slotToAlt(
            "other_day_same_hour",
            match,
            staffId ? "Outro dia, mesmo horário" : "Outro dia, mesmo horário"
          )
        );
      }
    }
  }

  // Monta 2–3 opções diversificadas (1 de cada tipo quando possível)
  const alternatives: BookingAlternative[] = [];
  const pushUnique = (a: BookingAlternative | undefined) => {
    if (!a) return;
    if (alternatives.some((x) => x.date === a.date && x.hour === a.hour && x.staffId === a.staffId))
      return;
    alternatives.push(a);
  };
  pushUnique(sameDayOtherStaff[0]);
  pushUnique(sameDayOtherHours[0]);
  pushUnique(otherDaysSameHour[0]);
  if (alternatives.length < 3) pushUnique(sameDayOtherHours[1]);
  if (alternatives.length < 3) pushUnique(sameDayOtherStaff[1]);
  if (alternatives.length < 3) pushUnique(otherDaysSameHour[1]);
  if (alternatives.length < 3) pushUnique(sameDayOtherHours[2]);

  return {
    alternatives: alternatives.slice(0, 3),
    sameDayOtherStaff,
    sameDayOtherHours,
    otherDaysSameHour,
  };
}
