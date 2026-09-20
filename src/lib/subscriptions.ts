export type SubscriptionStatus = "active" | "late" | "cancelled";

export function labelSubscriptionStatus(status: SubscriptionStatus | string): string {
  if (status === "active") return "Ativa";
  if (status === "late") return "Atrasada";
  if (status === "cancelled") return "Cancelada";
  return status;
}
