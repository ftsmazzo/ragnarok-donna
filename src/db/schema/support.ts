import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { timestamps } from "./enums";
import { tenants, users } from "./platform";

/**
 * Thread de suporte interno (dono / recepção / barbeiro).
 * Separado das conversations WhatsApp da Donna.
 */
export const supportThreads = pgTable(
  "support_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** ai | human */
    status: varchar("status", { length: 16 }).notNull().default("ai"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    humanRequestedAt: timestamp("human_requested_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("support_threads_tenant_idx").on(t.tenantId),
    index("support_threads_tenant_user_idx").on(t.tenantId, t.userId),
    index("support_threads_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

/** Mensagens: user | assistant | human_support | system */
export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => supportThreads.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 24 }).notNull(),
    body: text("body").notNull().default(""),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("support_messages_thread_created_idx").on(t.threadId, t.createdAt)]
);
