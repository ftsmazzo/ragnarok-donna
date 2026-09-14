export function getEvolutionConfig() {
  const baseUrl = process.env.EVOLUTION_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("EVOLUTION_URL e EVOLUTION_API_KEY são obrigatórios");
  }
  return { baseUrl, apiKey };
}

export type EvolutionProxyConfig = {
  host: string;
  port: string;
  protocol: "http" | "https" | "socks4" | "socks5";
  username?: string;
  password?: string;
};

/** Lê proxy das env. Retorna null se host/porta não estiverem definidos. */
export function getEvolutionProxyConfig(): EvolutionProxyConfig | null {
  const host = process.env.EVOLUTION_PROXY_HOST?.trim();
  const port = process.env.EVOLUTION_PROXY_PORT?.trim();
  if (!host || !port) return null;

  const rawProtocol = (process.env.EVOLUTION_PROXY_PROTOCOL?.trim() || "http").toLowerCase();
  const protocol =
    rawProtocol === "https" || rawProtocol === "socks4" || rawProtocol === "socks5"
      ? rawProtocol
      : "http";

  const username = process.env.EVOLUTION_PROXY_USERNAME?.trim() || undefined;
  const password = process.env.EVOLUTION_PROXY_PASSWORD?.trim() || undefined;

  return { host, port, protocol, username, password };
}

/** Proxy obrigatório para criar/recriar instância. */
export function requireEvolutionProxyConfig(): EvolutionProxyConfig {
  const proxy = getEvolutionProxyConfig();
  if (!proxy) {
    throw new Error(
      "Proxy obrigatório: configure EVOLUTION_PROXY_HOST e EVOLUTION_PROXY_PORT (opcional: PROTOCOL, USERNAME, PASSWORD)."
    );
  }
  return proxy;
}

export function getAppPublicUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL não configurada");
  }
  return url;
}

export function getAgentWebhookUrl() {
  const base = getAppPublicUrl();
  const secret = process.env.AGENT_WEBHOOK_SECRET?.trim();
  if (secret) {
    return `${base}/api/agent/webhook?secret=${encodeURIComponent(secret)}`;
  }
  return `${base}/api/agent/webhook`;
}
