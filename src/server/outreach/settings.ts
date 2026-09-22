import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import {
  DEFAULT_OUTREACH_VARIANT_POOLS,
  defaultOutreachSettings,
  type OutreachSettingsView,
} from "./defaults";

function asStringArray(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
}

function parseVariantsText(raw: string | string[] | undefined, fallback: string[]): string[] {
  if (raw == null) return fallback;
  if (Array.isArray(raw)) return asStringArray(raw, fallback);
  return raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function rowToView(row: typeof schema.tenantOutreachSettings.$inferSelect): OutreachSettingsView {
  const defaults = defaultOutreachSettings();
  return {
    confirmationEnabled: row.confirmationEnabled,
    followup30Enabled: row.followup30Enabled,
    followup60Enabled: row.followup60Enabled,
    sundayBlastEnabled: row.sundayBlastEnabled,
    emptyAgendaEnabled: row.emptyAgendaEnabled,
    soundOnConfirmEnabled: row.soundOnConfirmEnabled,
    birthdayEnabled: row.birthdayEnabled ?? defaults.birthdayEnabled,
    birthdayDiscountPct: row.birthdayDiscountPct ?? defaults.birthdayDiscountPct,
    confirmationSendTime: row.confirmationSendTime || defaults.confirmationSendTime,
    skipSundays: row.skipSundays,
    skipHolidays: row.skipHolidays,
    customClosedDates: Array.isArray(row.customClosedDates) ? row.customClosedDates : [],
    followupMonthDays:
      Array.isArray(row.followupMonthDays) && row.followupMonthDays.length
        ? row.followupMonthDays.map(Number).filter((n) => n >= 1 && n <= 31)
        : defaults.followupMonthDays,
    followup30Days: row.followup30Days || 30,
    followup60Days: row.followup60Days || 60,
    blastActiveWithinDays: row.blastActiveWithinDays || 120,
    dailyCap: Math.min(500, Math.max(10, Number(row.dailyCap ?? defaults.dailyCap) || 100)),
    dryRunEnabled: row.dryRunEnabled ?? defaults.dryRunEnabled,
    templateConfirmation: row.templateConfirmation || defaults.templateConfirmation,
    templateFollowup30: row.templateFollowup30 || defaults.templateFollowup30,
    templateFollowup60: row.templateFollowup60 || defaults.templateFollowup60,
    templateSundayBlast: row.templateSundayBlast || defaults.templateSundayBlast,
    templateEmptyAgenda: row.templateEmptyAgenda || defaults.templateEmptyAgenda,
    templateBirthday: row.templateBirthday || defaults.templateBirthday,
    templateConfirmationVariants: asStringArray(
      row.templateConfirmationVariants,
      defaults.templateConfirmationVariants
    ),
    templateFollowup30Variants: asStringArray(
      row.templateFollowup30Variants,
      defaults.templateFollowup30Variants
    ),
    templateFollowup60Variants: asStringArray(
      row.templateFollowup60Variants,
      defaults.templateFollowup60Variants
    ),
    templateSundayBlastVariants: asStringArray(
      row.templateSundayBlastVariants,
      defaults.templateSundayBlastVariants
    ),
    templateEmptyAgendaVariants: asStringArray(
      row.templateEmptyAgendaVariants,
      defaults.templateEmptyAgendaVariants
    ),
    templateBirthdayVariants: asStringArray(
      row.templateBirthdayVariants,
      defaults.templateBirthdayVariants
    ),
  };
}

export async function assertCanWriteOutreach() {
  const session = await requireSession();
  const tenant = await requireTenantContext();
  if (!hasCapability(session.role, "outreach.write")) {
    throw new ForbiddenError("Sem permissão para editar disparos");
  }
  return { session, tenant };
}

export async function assertCanReadOutreach() {
  const session = await requireSession();
  const tenant = await requireTenantContext();
  if (!hasCapability(session.role, "outreach.write") && !hasCapability(session.role, "outreach.read")) {
    throw new ForbiddenError("Sem permissão para ver disparos");
  }
  return { session, tenant };
}

/** Settings do tenant (cria defaults se não existir). */
export async function getOutreachSettingsForTenant(
  tenantId: string
): Promise<OutreachSettingsView> {
  const db = createDb();
  const [row] = await db
    .select()
    .from(schema.tenantOutreachSettings)
    .where(eq(schema.tenantOutreachSettings.tenantId, tenantId))
    .limit(1);
  if (row) return rowToView(row);

  const defaults = defaultOutreachSettings();
  const [created] = await db
    .insert(schema.tenantOutreachSettings)
    .values({
      tenantId,
      ...defaults,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return rowToView(created);

  const [again] = await db
    .select()
    .from(schema.tenantOutreachSettings)
    .where(eq(schema.tenantOutreachSettings.tenantId, tenantId))
    .limit(1);
  return again ? rowToView(again) : defaults;
}

export async function getOutreachSettings(): Promise<OutreachSettingsView> {
  const { tenant } = await assertCanReadOutreach();
  return getOutreachSettingsForTenant(tenant.id);
}

function parseHm(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "18:00";
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseMonthDays(raw: string | number[]): number[] {
  const parts = Array.isArray(raw)
    ? raw
    : raw
        .split(/[,;\s]+/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n));
  const days = [...new Set(parts.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= 31))].sort(
    (a, b) => a - b
  );
  return days.length ? days : [5, 6, 10, 11, 20, 21];
}

function parseClosedDates(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,;\n]+/).map((x) => x.trim());
  return [...new Set(parts.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

export async function saveOutreachSettings(
  input: Partial<OutreachSettingsView> & {
    customClosedDatesText?: string;
    followupMonthDaysText?: string;
    templateConfirmationVariantsText?: string;
    templateFollowup30VariantsText?: string;
    templateFollowup60VariantsText?: string;
    templateSundayBlastVariantsText?: string;
    templateEmptyAgendaVariantsText?: string;
    templateBirthdayVariantsText?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { tenant } = await assertCanWriteOutreach();
    const current = await getOutreachSettingsForTenant(tenant.id);
    const next: OutreachSettingsView = {
      ...current,
      confirmationEnabled: input.confirmationEnabled ?? current.confirmationEnabled,
      followup30Enabled: input.followup30Enabled ?? current.followup30Enabled,
      followup60Enabled: input.followup60Enabled ?? current.followup60Enabled,
      sundayBlastEnabled: input.sundayBlastEnabled ?? current.sundayBlastEnabled,
      emptyAgendaEnabled: input.emptyAgendaEnabled ?? current.emptyAgendaEnabled,
      soundOnConfirmEnabled: input.soundOnConfirmEnabled ?? current.soundOnConfirmEnabled,
      birthdayEnabled: input.birthdayEnabled ?? current.birthdayEnabled,
      birthdayDiscountPct: Math.min(
        100,
        Math.max(0, Number(input.birthdayDiscountPct ?? current.birthdayDiscountPct) || 0)
      ),
      confirmationSendTime: parseHm(
        input.confirmationSendTime ?? current.confirmationSendTime
      ),
      skipSundays: input.skipSundays ?? current.skipSundays,
      skipHolidays: input.skipHolidays ?? current.skipHolidays,
      customClosedDates:
        input.customClosedDatesText != null
          ? parseClosedDates(input.customClosedDatesText)
          : input.customClosedDates ?? current.customClosedDates,
      followupMonthDays:
        input.followupMonthDaysText != null
          ? parseMonthDays(input.followupMonthDaysText)
          : input.followupMonthDays ?? current.followupMonthDays,
      followup30Days: Math.min(
        365,
        Math.max(7, Number(input.followup30Days ?? current.followup30Days) || 30)
      ),
      followup60Days: Math.min(
        730,
        Math.max(14, Number(input.followup60Days ?? current.followup60Days) || 60)
      ),
      blastActiveWithinDays: Math.min(
        730,
        Math.max(30, Number(input.blastActiveWithinDays ?? current.blastActiveWithinDays) || 120)
      ),
      dailyCap: Math.min(
        500,
        Math.max(10, Number(input.dailyCap ?? current.dailyCap) || 100)
      ),
      dryRunEnabled: input.dryRunEnabled ?? current.dryRunEnabled,
      templateConfirmation: (input.templateConfirmation ?? current.templateConfirmation)
        .trim()
        .slice(0, 2000),
      templateFollowup30: (input.templateFollowup30 ?? current.templateFollowup30)
        .trim()
        .slice(0, 2000),
      templateFollowup60: (input.templateFollowup60 ?? current.templateFollowup60)
        .trim()
        .slice(0, 2000),
      templateSundayBlast: (input.templateSundayBlast ?? current.templateSundayBlast)
        .trim()
        .slice(0, 2000),
      templateEmptyAgenda: (input.templateEmptyAgenda ?? current.templateEmptyAgenda)
        .trim()
        .slice(0, 2000),
      templateBirthday: (input.templateBirthday ?? current.templateBirthday)
        .trim()
        .slice(0, 2000),
      templateConfirmationVariants: parseVariantsText(
        input.templateConfirmationVariantsText ?? input.templateConfirmationVariants,
        current.templateConfirmationVariants
      ),
      templateFollowup30Variants: parseVariantsText(
        input.templateFollowup30VariantsText ?? input.templateFollowup30Variants,
        current.templateFollowup30Variants
      ),
      templateFollowup60Variants: parseVariantsText(
        input.templateFollowup60VariantsText ?? input.templateFollowup60Variants,
        current.templateFollowup60Variants
      ),
      templateSundayBlastVariants: parseVariantsText(
        input.templateSundayBlastVariantsText ?? input.templateSundayBlastVariants,
        current.templateSundayBlastVariants
      ),
      templateEmptyAgendaVariants: parseVariantsText(
        input.templateEmptyAgendaVariantsText ?? input.templateEmptyAgendaVariants,
        current.templateEmptyAgendaVariants
      ),
      templateBirthdayVariants: parseVariantsText(
        input.templateBirthdayVariantsText ?? input.templateBirthdayVariants,
        current.templateBirthdayVariants
      ),
    };

    // Garantir pool mínimo se usuário limpar tudo
    if (!next.templateConfirmation.trim()) {
      next.templateConfirmation = DEFAULT_OUTREACH_VARIANT_POOLS.confirmation[0];
    }

    const db = createDb();
    const [existing] = await db
      .select({ id: schema.tenantOutreachSettings.id })
      .from(schema.tenantOutreachSettings)
      .where(eq(schema.tenantOutreachSettings.tenantId, tenant.id))
      .limit(1);

    if (existing) {
      await db
        .update(schema.tenantOutreachSettings)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(schema.tenantOutreachSettings.tenantId, tenant.id));
    } else {
      await db.insert(schema.tenantOutreachSettings).values({
        tenantId: tenant.id,
        ...next,
      });
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao salvar",
    };
  }
}
