import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { importRunStatusEnum, importSourceEnum, timestamps } from "./enums";
import { tenants } from "./platform";

/**
 * Cada importação (AppBarber → nosso banco) fica registrada.
 * Idempotente via external_source + external_id nas entidades.
 */
export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    source: importSourceEnum("source").notNull().default("appbarber"),
    status: importRunStatusEnum("status").notNull().default("pending"),
    label: varchar("label", { length: 160 }),
    /** Caminho/pasta do export ou checksum */
    artifactUri: text("artifact_uri"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    stats: jsonb("stats")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("import_runs_tenant_idx").on(t.tenantId)]
);

/**
 * Log linha a linha opcional (erros de mapeamento).
 */
export const importRunErrors = pgTable(
  "import_run_errors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    entity: varchar("entity", { length: 60 }).notNull(),
    externalId: varchar("external_id", { length: 80 }),
    message: text("message").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("import_run_errors_run_idx").on(t.importRunId)]
);
