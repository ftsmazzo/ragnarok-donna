"use server";

import { revalidatePath } from "next/cache";
import {
  createBlock,
  removeBlock,
  scheduleAppointment,
  scheduleEncaixe,
  updateAppointmentStatus,
} from "@/server/agenda/mutations";
import { searchClientsForAgenda } from "@/server/agenda/queries";

function parseForm(formData: FormData) {
  return {
    staffId: String(formData.get("staffId") ?? ""),
    date: String(formData.get("date") ?? ""),
    hour: Number(formData.get("hour")),
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
