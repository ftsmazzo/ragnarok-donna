import { timingSafeEqual } from "node:crypto";

/**
 * Auth de serviço (webhook Evolution / n8n / MCP).
 * Não usa sessão de usuário do painel.
 */
export function assertAgentServiceToken(headerValue: string | null): void {
  const expected = process.env.AGENT_SERVICE_TOKEN;
  if (!expected || expected.length < 16) {
    throw new Error("AGENT_SERVICE_TOKEN não configurado");
  }
  if (!headerValue) throw new Error("Unauthorized");
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Unauthorized");
  }
}

export function readBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}
