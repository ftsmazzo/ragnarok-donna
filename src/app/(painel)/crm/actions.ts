"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { requireCapability } from "@/server/permissions/guards";
import { requireSession, requireTenantContext } from "@/server/context/tenant";
import { CRM_STAGES } from "@/lib/crm";

export type ActionResult = { ok: true } | { ok: false; error: string };

const STAGE_SET = new Set(CRM_STAGES.map((s) => s.value));

/** Atualiza só a etapa do funil (Kanban). */
export async function setClientCrmStageAction(
  clientId: string,
  stage: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    requireCapability(session, "clients.write");
    const tenant = await requireTenantContext();

    const nextStage = stage.trim();
    if (nextStage && !STAGE_SET.has(nextStage as (typeof CRM_STAGES)[number]["value"])) {
      throw new AppError("VALIDATION", "Etapa inválida");
    }

    const db = createDb();
    const [existing] = await db
      .select({ preferences: schema.clients.preferences })
      .from(schema.clients)
      .where(
        and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id))
      )
      .limit(1);

    if (!existing) throw new NotFoundError("Cliente não encontrado");

    const prefs = { ...(existing.preferences ?? {}) };
    const prev = typeof prefs.crmStage === "string" ? prefs.crmStage : "";
    const actor = session.user.name ?? session.user.email ?? "painel";

    if (nextStage) {
      prefs.crmStage = nextStage;
      if (nextStage !== prev) {
        const hist = Array.isArray(prefs.crmStageHistory)
          ? [...(prefs.crmStageHistory as unknown[])]
          : [];
        hist.push({ stage: nextStage, at: new Date().toISOString(), by: actor });
        prefs.crmStageHistory = hist.slice(-40);
      }
      delete prefs.crmExit;
      delete prefs.crmExitReason;
      if (!prefs.crmStatus || prefs.crmStatus === "lapsed") {
        prefs.crmStatus = nextStage === "cliente" ? "client" : "lead";
      }
      if (nextStage === "cliente") prefs.crmStatus = "client";
    } else {
      delete prefs.crmStage;
    }

    await db
      .update(schema.clients)
      .set({ preferences: prefs, updatedAt: new Date() })
      .where(
        and(eq(schema.clients.id, clientId), eq(schema.clients.tenantId, tenant.id))
      );

    revalidatePath("/crm");
    revalidatePath("/clientes");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "Sem permissão" };
    console.error("[setClientCrmStageAction]", err);
    return { ok: false, error: "Não foi possível mover no funil" };
  }
}
