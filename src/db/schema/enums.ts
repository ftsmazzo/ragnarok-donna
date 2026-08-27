import { pgEnum, timestamp, varchar } from "drizzle-orm/pg-core";

/** Timestamps padrão */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

/** Soft delete opcional */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const tenantStatusEnum = pgEnum("tenant_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "suspended",
]);

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "manager",
  "staff",
  "readonly",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "blocked",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "open",
  "closed",
  "cancelled",
]);

export const orderItemTypeEnum = pgEnum("order_item_type", [
  "service",
  "product",
  "package",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "pix",
  "debit",
  "credit",
  "transfer",
  "other",
]);

/** Vale, bônus, desconto de comissão ou liquidação (pagamento) */
export const staffAdvanceKindEnum = pgEnum("staff_advance_kind", [
  "vale",
  "bonus",
  "discount",
  "payout",
]);

export const staffAdvanceStatusEnum = pgEnum("staff_advance_status", [
  "open",
  "settled",
  "cancelled",
]);

export const conversationModeEnum = pgEnum("conversation_mode", [
  "ai",
  "human",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound_ai",
  "outbound_human",
  "system",
]);

export const agentToolStatusEnum = pgEnum("agent_tool_status", [
  "ok",
  "error",
  "denied",
]);

export const importSourceEnum = pgEnum("import_source", [
  "appbarber",
  "manual",
  "csv",
  "other",
]);

export const importRunStatusEnum = pgEnum("import_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

/** Colunas de origem externa (migração AppBarber etc.) */
export function externalRef() {
  return {
    externalSource: varchar("external_source", { length: 40 }),
    externalId: varchar("external_id", { length: 80 }),
  };
}
