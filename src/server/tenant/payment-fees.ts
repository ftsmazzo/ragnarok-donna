import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError } from "@/server/errors";
import { requireSession, requireTenantContext } from "@/server/context/tenant";
import { requireCapability } from "@/server/permissions/guards";
import {
  DEFAULT_PAYMENT_FEES,
  normalizePaymentFees,
  paymentFeesFromTenantSettings,
  type PaymentFeesTable,
} from "@/lib/payment-fees";

export type PaymentFeesFormView = PaymentFeesTable & {
  isCustom: boolean;
};

async function loadTenantSettings(tenantId: string): Promise<Record<string, unknown>> {
  const db = createDb();
  const [row] = await db
    .select({ settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  return row?.settings && typeof row.settings === "object"
    ? (row.settings as Record<string, unknown>)
    : {};
}

export async function getPaymentFeesForm(): Promise<PaymentFeesFormView> {
  const tenant = await requireTenantContext();
  const settings = await loadTenantSettings(tenant.id);
  const fees = paymentFeesFromTenantSettings(settings);
  return {
    ...fees,
    isCustom: Boolean(settings.paymentFees),
  };
}

/** Fees resolvidos para o tenant atual (caixa / relatórios). */
export async function resolveTenantPaymentFees(): Promise<PaymentFeesTable> {
  const tenant = await requireTenantContext();
  const settings = await loadTenantSettings(tenant.id);
  return paymentFeesFromTenantSettings(settings);
}

export async function savePaymentFeesForm(
  input: PaymentFeesTable
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    requireCapability(session, "settings.write");
    const tenant = await requireTenantContext();
    const fees = normalizePaymentFees(input);
    const db = createDb();
    const prev = await loadTenantSettings(tenant.id);
    await db
      .update(schema.tenants)
      .set({
        settings: { ...prev, paymentFees: fees },
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id));
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    console.error("[savePaymentFeesForm]", err);
    return { ok: false, error: "Não foi possível salvar as taxas" };
  }
}

export async function resetPaymentFeesForm(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const session = await requireSession();
    requireCapability(session, "settings.write");
    const tenant = await requireTenantContext();
    const db = createDb();
    const prev = await loadTenantSettings(tenant.id);
    const next = { ...prev };
    delete next.paymentFees;
    await db
      .update(schema.tenants)
      .set({
        settings: next,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id));
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Não foi possível restaurar o padrão" };
  }
}

export { DEFAULT_PAYMENT_FEES };
