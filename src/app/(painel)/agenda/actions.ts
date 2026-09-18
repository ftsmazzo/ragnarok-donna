"use server";

import { revalidatePath } from "next/cache";
import {
  createBlock,
  patchAppointmentMeta,
  removeBlock,
  scheduleAppointment,
  scheduleEncaixe,
  setAppointmentEncaixe,
  updateAppointment,
  updateAppointmentStatus,
} from "@/server/agenda/mutations";
import { scheduleRecurringSeries } from "@/server/agenda/recurring";
import type { AppointmentEditScope } from "@/server/agenda/types";
import { searchClientsForAgenda } from "@/server/agenda/queries";
import { payAndCloseOrder } from "@/server/orders/mutations";

function parseForm(formData: FormData) {
  return {
    staffId: String(formData.get("staffId") ?? ""),
    date: String(formData.get("date") ?? ""),
    hour: Number(formData.get("hour")),
    minute: Number(formData.get("minute") || 0),
    durationMin: Number(formData.get("durationMin") || 30),
    clientId: String(formData.get("clientId") ?? "") || undefined,
    serviceId: String(formData.get("serviceId") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  };
}

function revalidateAgenda(date: string) {
  revalidatePath("/agenda");
  revalidatePath(`/agenda?date=${date}`);
}

export async function searchClientsAction(q: string) {
  return searchClientsForAgenda(q);
}

export async function scheduleAppointmentAction(formData: FormData) {
  const input = parseForm(formData);
  const result = await scheduleAppointment(input);
  if (result.ok) revalidateAgenda(input.date);
  return result;
}

export async function scheduleRecurringAction(formData: FormData) {
  const input = parseForm(formData);
  const result = await scheduleRecurringSeries({
    ...input,
    periodicity: String(formData.get("periodicity") ?? "weekly"),
    quantity: Number(formData.get("quantity") || 1),
  });
  if (result.ok) revalidateAgenda(input.date);
  return result;
}

export async function scheduleEncaixeAction(formData: FormData) {
  const input = parseForm(formData);
  const result = await scheduleEncaixe(input);
  if (result.ok) revalidateAgenda(input.date);
  return result;
}

export async function createBlockAction(formData: FormData) {
  const input = parseForm(formData);
  const result = await createBlock(input);
  if (result.ok) revalidateAgenda(input.date);
  return result;
}

export async function updateAppointmentStatusAction(id: string, status: string, date: string) {
  const result = await updateAppointmentStatus(id, status);
  if (result.ok) revalidateAgenda(date);
  return result;
}

export async function removeBlockAction(id: string, date: string) {
  const result = await removeBlock(id);
  if (result.ok) revalidateAgenda(date);
  return result;
}

export async function patchAppointmentMetaAction(
  id: string,
  date: string,
  patch: { noPreference?: boolean; addTag?: string; clearTags?: boolean }
) {
  const result = await patchAppointmentMeta(id, patch);
  if (result.ok) revalidateAgenda(date);
  return result;
}

export async function setAppointmentEncaixeAction(id: string, isEncaixe: boolean, date: string) {
  const result = await setAppointmentEncaixe(id, isEncaixe);
  if (result.ok) revalidateAgenda(date);
  return result;
}

export async function updateAppointmentAction(formData: FormData) {
  const scope = String(formData.get("scope") ?? "all") as AppointmentEditScope;
  const date = String(formData.get("date") ?? "");
  const serviceRaw = String(formData.get("serviceId") ?? "");
  const result = await updateAppointment({
    id: String(formData.get("id") ?? ""),
    scope,
    date: date || undefined,
    hour: formData.get("hour") != null && formData.get("hour") !== ""
      ? Number(formData.get("hour"))
      : undefined,
    minute: formData.get("minute") != null && formData.get("minute") !== ""
      ? Number(formData.get("minute"))
      : undefined,
    durationMin: formData.get("durationMin") != null && formData.get("durationMin") !== ""
      ? Number(formData.get("durationMin"))
      : undefined,
    staffId: String(formData.get("staffId") ?? "") || undefined,
    serviceId: serviceRaw === "" ? null : serviceRaw,
    notes: formData.get("notes") != null ? String(formData.get("notes")) : undefined,
  });
  if (result.ok && date) revalidateAgenda(date);
  else if (result.ok) revalidatePath("/agenda");
  return result;
}

export async function payAndCloseFromAgendaAction(orderId: string, method: string, date: string) {
  const result = await payAndCloseOrder({ orderId, method });
  if (result.ok) {
    revalidatePath("/comandas");
    revalidatePath("/caixa");
    revalidateAgenda(date);
  }
  return result;
}
