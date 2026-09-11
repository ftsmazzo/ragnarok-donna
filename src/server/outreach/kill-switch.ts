/**
 * Kill switch global de disparos WhatsApp.
 * Padrão: DESLIGADO. Só envia se OUTREACH_DISPATCH_ENABLED=true|1|yes.
 * Toggles da unidade não bastam — evita confusão com clientes no AppBarber.
 */
export function isOutreachDispatchEnabled(): boolean {
  const raw = process.env.OUTREACH_DISPATCH_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
