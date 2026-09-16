import { isAppError } from "../errors";

export const SUPPORT_WEBHOOK_TIMEOUT_MS = 8_000;
export const SUPPORT_HANDOFF_CLAIM_STALE_MS = 30_000;

export function isSuccessfulHttpStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** A consulta busca mais recentes primeiro; a UI precisa recebê-las cronologicamente. */
export function toChronologicalOrder<T>(recentFirst: readonly T[]): T[] {
  return [...recentFirst].reverse();
}

export function publicSupportError(
  err: unknown,
  fallback = "Não foi possível usar o suporte agora"
): string {
  return isAppError(err) ? err.message : fallback;
}

export const HUMAN_HANDOFF_QUEUED_REPLY =
  "A Fábrica foi notificada pelo canal de atendimento configurado. Deixe os detalhes aqui; o retorno acontece pelo contato externo da equipe.";

export const HUMAN_HANDOFF_ACTIVE_REPLY =
  "Encaminhei este detalhe para o canal humano. O retorno acontece pelo contato externo da equipe.";

export const HUMAN_HANDOFF_ALREADY_REPLY =
  "O atendimento humano já foi notificado. O retorno acontece pelo contato externo da equipe.";

export const HUMAN_HANDOFF_PENDING_REPLY =
  "A notificação do atendimento humano ainda está em andamento. Aguarde um instante antes de tentar novamente.";
