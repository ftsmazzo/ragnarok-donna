/**
 * Cliente LLM OpenAI-compatible (OpenAI ou OpenRouter).
 * Env:
 * - OPENAI_API_KEY (+ opcional OPENAI_BASE_URL)
 * - ou OPENROUTER_API_KEY
 */
let llmDisabledReason: string | null = null;

export function getLlmConfig() {
  if (llmDisabledReason) return null;
  const openRouter = process.env.OPENROUTER_API_KEY?.trim();
  const openAi = process.env.OPENAI_API_KEY?.trim();
  if (openRouter) {
    return {
      apiKey: openRouter,
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "openai/gpt-4.1-mini",
    };
  }
  if (openAi) {
    return {
      apiKey: openAi,
      baseUrl: (process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1"),
      defaultModel: "gpt-4.1-mini",
    };
  }
  return null;
}

export function resolveModelId(profileModel: string | null | undefined): string {
  const cfg = getLlmConfig();
  const raw = (profileModel || cfg?.defaultModel || "gpt-4.1-mini").trim();
  if (!cfg) return raw;
  // OpenAI oficial não aceita prefixo "openai/"
  if (cfg.baseUrl.includes("openai.com") && raw.startsWith("openai/")) {
    return raw.slice("openai/".length);
  }
  return raw;
}

export async function chatCompletion(input: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string | null> {
  const cfg = getLlmConfig();
  if (!cfg) return null;

  const model = resolveModelId(input.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...(cfg.baseUrl.includes("openrouter")
          ? {
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://ragnarok-donna.app",
              "X-Title": "Donna Barbearia",
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: input.temperature ?? 0.55,
        max_tokens: input.maxTokens ?? 220,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[llm] HTTP", res.status, errText.slice(0, 200));
      if (res.status === 401 || res.status === 403) {
        llmDisabledReason = `auth_${res.status}`;
        console.warn("[llm] desabilitado neste processo por auth inválida");
      }
      return null;
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.warn("[llm] falhou", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
