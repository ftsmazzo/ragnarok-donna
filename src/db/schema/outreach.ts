import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { timestamps } from "./enums";
import { tenants } from "./platform";

/**
 * Regras de disparos WhatsApp por unidade (dono/recepção).
 * 1 row / tenant.
 */
export const tenantOutreachSettings = pgTable(
  "tenant_outreach_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    confirmationEnabled: boolean("confirmation_enabled").notNull().default(false),
    followup30Enabled: boolean("followup30_enabled").notNull().default(false),
    followup60Enabled: boolean("followup60_enabled").notNull().default(false),
    sundayBlastEnabled: boolean("sunday_blast_enabled").notNull().default(false),
    emptyAgendaEnabled: boolean("empty_agenda_enabled").notNull().default(false),
    soundOnConfirmEnabled: boolean("sound_on_confirm_enabled").notNull().default(false),
    birthdayEnabled: boolean("birthday_enabled").notNull().default(false),
    /** Desconto % sugerido no template de aniversário (editável). */
    birthdayDiscountPct: integer("birthday_discount_pct").notNull().default(10),

    /** HH:mm America/Sao_Paulo — horário alvo da confirmação D+1 */
    confirmationSendTime: varchar("confirmation_send_time", { length: 5 })
      .notNull()
      .default("18:00"),

    skipSundays: boolean("skip_sundays").notNull().default(true),
    skipHolidays: boolean("skip_holidays").notNull().default(true),
    /** Datas YYYY-MM-DD extras fechadas */
    customClosedDates: jsonb("custom_closed_dates").$type<string[]>().notNull().default([]),

    /** Dias do mês para retorno 30/60 — default 5,6,10,11,20,21 */
    followupMonthDays: jsonb("followup_month_days")
      .$type<number[]>()
      .notNull()
      .default([5, 6, 10, 11, 20, 21]),
    followup30Days: integer("followup30_days").notNull().default(30),
    followup60Days: integer("followup60_days").notNull().default(60),
    /** Blast: clientes com visita nos últimos N dias */
    blastActiveWithinDays: integer("blast_active_within_days").notNull().default(120),

    templateConfirmation: text("template_confirmation").notNull().default(""),
    templateFollowup30: text("template_followup30").notNull().default(""),
    templateFollowup60: text("template_followup60").notNull().default(""),
    templateSundayBlast: text("template_sunday_blast").notNull().default(""),
    templateEmptyAgenda: text("template_empty_agenda").notNull().default(""),
    templateBirthday: text("template_birthday").notNull().default(""),

    /** Variantes extras por kind (anti-fingerprint). */
    templateConfirmationVariants: jsonb("template_confirmation_variants")
      .$type<string[]>()
      .notNull()
      .default([]),
    templateFollowup30Variants: jsonb("template_followup30_variants")
      .$type<string[]>()
      .notNull()
      .default([]),
    templateFollowup60Variants: jsonb("template_followup60_variants")
      .$type<string[]>()
      .notNull()
      .default([]),
    templateSundayBlastVariants: jsonb("template_sunday_blast_variants")
      .$type<string[]>()
      .notNull()
      .default([]),
    templateEmptyAgendaVariants: jsonb("template_empty_agenda_variants")
      .$type<string[]>()
      .notNull()
      .default([]),
    templateBirthdayVariants: jsonb("template_birthday_variants")
      .$type<string[]>()
      .notNull()
      .default([]),

    /** Teto diário de jobs sent/dry_run. */
    dailyCap: integer("daily_cap").notNull().default(100),
    /** Simula sem Evolution. */
    dryRunEnabled: boolean("dry_run_enabled").notNull().default(true),

    ...timestamps,
  },
  (t) => [uniqueIndex("tenant_outreach_settings_tenant_uidx").on(t.tenantId)]
);
