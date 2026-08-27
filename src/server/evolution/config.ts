export function getEvolutionConfig() {
  const baseUrl = process.env.EVOLUTION_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("EVOLUTION_URL e EVOLUTION_API_KEY são obrigatórios");
  }
  return { baseUrl, apiKey };
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
