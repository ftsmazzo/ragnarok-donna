/**
 * Kill switch global de disparos WhatsApp.
 * Padrão: DESLIGADO. Só envia se OUTREACH_DISPATCH_ENABLED=true|1|yes.
 * Toggles da unidade não bastam — evita confusão com clientes no AppBarber.
 */
export function isOutreachDispatchEnabled(): boolean {
  const raw = process.env.OUTREACH_DISPATCH_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/** Dry-run global via env (ou settings.dryRunEnabled por tenant). */
export function isOutreachDryRunEnv(): boolean {
  const raw = process.env.OUTREACH_DRY_RUN?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  // Sem env: default true enquanto dispatch estiver off (seguro).
  return !isOutreachDispatchEnabled();
}

/** Blast domingo exige flag explícita além do toggle. */
export function isSundayBlastHardAllowed(): boolean {
  const raw = process.env.OUTREACH_ALLOW_SUNDAY_BLAST?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * Pode enfileirar/planear jobs: dispatch real OU dry-run.
 */
export function isOutreachPlanningEnabled(tenantDryRun?: boolean): boolean {
  if (isOutreachDispatchEnabled()) return true;
  if (tenantDryRun === true) return true;
  return isOutreachDryRunEnv();
}

/**
 * Envio real na Evolution: dispatch on E dry-run off (env + tenant).
 */
export function shouldSendOutreachLive(tenantDryRun?: boolean): boolean {
  if (!isOutreachDispatchEnabled()) return false;
  if (tenantDryRun) return false;
  const raw = process.env.OUTREACH_DRY_RUN?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return false;
  return true;
}
