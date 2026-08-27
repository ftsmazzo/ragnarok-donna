import type { FollowUpRow } from "@/server/insights/types";

/** Rascunho de WhatsApp (sem LLM — Donna personaliza na Sprint 6). */
export function buildFollowUpDraft(row: FollowUpRow, tenantName?: string): string {
  const first = row.clientName.trim().split(/\s+/)[0] || "oi";
  const shop = tenantName?.trim() || "a barbearia";
  if (row.reason === "recurrence_lapsed") {
    const svc = row.lastServiceName ? ` (${row.lastServiceName})` : "";
    return (
      `Olá, ${first}! Aqui é da ${shop}. ` +
      `Notamos que sua recorrência${svc} ficou sem renovação há ${row.daysSince} dias. ` +
      `Quer que a gente reserve um horário pra você voltar?`
    );
  }
  const svc = row.lastServiceName ? ` Seu último atendimento foi ${row.lastServiceName}.` : "";
  return (
    `Olá, ${first}! Sentimos sua falta na ${shop}.` +
    `${svc} Faz ${row.daysSince} dias — que tal marcar um horário pra renovar o visual?`
  );
}
