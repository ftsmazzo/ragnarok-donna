import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import {
  agentToolStatusEnum,
  conversationModeEnum,
  messageDirectionEnum,
  softDelete,
  timestamps,
} from "./enums";
import { tenants, users } from "./platform";
import { clients } from "./shop";

/**
 * Conexão WhatsApp por tenant (Evolution / provedor).
 * Padrão PrismaBook: 1 número operacional por loja.
 */
export const whatsappConnections = pgTable(
  "whatsapp_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull().default("evolution"),
    instanceName: varchar("instance_name", { length: 120 }).notNull(),
    phoneE164: varchar("phone_e164", { length: 20 }),
    status: varchar("status", { length: 40 }).notNull().default("disconnected"),
    webhookSecret: varchar("webhook_secret", { length: 120 }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("whatsapp_connections_tenant_uidx").on(t.tenantId),
    uniqueIndex("whatsapp_connections_instance_uidx").on(t.instanceName),
  ]
);

/**
 * Persona / tools do agente IA (Donna-style, multi-tenant).
 */
export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(), // Pati, etc.
    displayName: varchar("display_name", { length: 120 }).notNull(),
    systemPrompt: text("system_prompt").notNull().default(""),
    /** Tools liberadas: list_slots, book, cancel, waitlist, handoff… */
    toolsEnabled: jsonb("tools_enabled").$type<string[]>().notNull().default([]),
    model: varchar("model", { length: 80 }).notNull().default("openai/gpt-4.1-mini"),
    temperature: integer("temperature").notNull().default(40), // /100
    isDefault: boolean("is_default").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("agent_profiles_tenant_idx").on(t.tenantId)]
);

/**
 * Thread de atendimento WhatsApp (gate IA ↔ humano).
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    phoneE164: varchar("phone_e164", { length: 20 }).notNull(),
    mode: conversationModeEnum("mode").notNull().default("ai"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    agentProfileId: uuid("agent_profile_id").references(() => agentProfiles.id, {
      onDelete: "set null",
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    humanRequestedAt: timestamp("human_requested_at", { withTimezone: true }),
    humanTakenAt: timestamp("human_taken_at", { withTimezone: true }),
    humanReturnedAt: timestamp("human_returned_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("conversations_tenant_phone_uidx").on(t.tenantId, t.phoneE164),
    index("conversations_tenant_mode_idx").on(t.tenantId, t.mode),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    body: text("body").notNull().default(""),
    waMessageId: varchar("wa_message_id", { length: 120 }),
    operatorUserId: uuid("operator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    mediaUrl: text("media_url"),
    mediaType: varchar("media_type", { length: 40 }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_wa_id_uidx").on(t.waMessageId),
  ]
);

/**
 * Auditoria de tools do agente (obrigatório em SaaS com IA).
 * Permite debug, billing de créditos e segurança.
 */
export const agentToolCalls = pgTable(
  "agent_tool_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    agentProfileId: uuid("agent_profile_id").references(() => agentProfiles.id, {
      onDelete: "set null",
    }),
    toolName: varchar("tool_name", { length: 80 }).notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    status: agentToolStatusEnum("status").notNull().default("ok"),
    durationMs: integer("duration_ms"),
    ...timestamps,
  },
  (t) => [
    index("agent_tool_calls_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("agent_tool_calls_tool_idx").on(t.toolName),
  ]
);

/** Uso de tokens / créditos por tenant (billing IA) */
export const aiUsageDaily = pgTable(
  "ai_usage_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    day: timestamp("day", { withTimezone: true }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    toolCalls: integer("tool_calls").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("ai_usage_daily_tenant_day_uidx").on(t.tenantId, t.day)]
);

/**
 * Fila de outreach (follow-up / campanha).
 * Donna ou n8n consome: pending → sending → sent|failed|cancelled.
 */
export const outreachJobs = pgTable(
  "outreach_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    phoneE164: varchar("phone_e164", { length: 20 }).notNull(),
    /** followup_inactive | followup_recurrence | manual | campaign */
    kind: varchar("kind", { length: 40 }).notNull().default("followup_inactive"),
    body: text("body").notNull().default(""),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorMessage: varchar("error_message", { length: 400 }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("outreach_jobs_tenant_status_sched_idx").on(t.tenantId, t.status, t.scheduledAt),
    index("outreach_jobs_tenant_client_idx").on(t.tenantId, t.clientId),
  ]
);
