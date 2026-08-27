/**
 * Cliente LLM OpenAI-compatible (OpenRouter / OpenAI) com suporte a tools.
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
      // Custo-benefício conversacional (não o mais barato)
      defaultModel: process.env.LLM_MODEL?.trim() || "anthropic/claude-sonnet-4.6",
    };
  }
  if (openAi) {
    return {
      apiKey: openAi,
      baseUrl: process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1",
      defaultModel: process.env.LLM_MODEL?.trim() || "gpt-4.1",
    };
  }
  return null;
}

export function resolveModelId(profileModel: string | null | undefined): string {
  const cfg = getLlmConfig();
  const raw = (profileModel || process.env.LLM_MODEL || cfg?.defaultModel || "anthropic/claude-sonnet-4.6").trim();
  if (!cfg) return raw;
  if (cfg.baseUrl.includes("openai.com") && raw.startsWith("openai/")) {
    return raw.slice("openai/".length);
  }
  return raw;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletionResult = {
  content: string | null;
  toolCalls: ToolCall[];
  model: string;
};

export async function chatCompletion(input: {
  model?: string | null;
  messages: ChatMessage[];
  tools?: ChatToolDef[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ChatCompletionResult | null> {
  const cfg = getLlmConfig();
  if (!cfg) return null;

  const model = resolveModelId(input.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 45_000);

  try {
    const body: Record<string, unknown> = {
      model,
      temperature: input.temperature ?? 0.45,
      max_tokens: input.maxTokens ?? 700,
      messages: input.messages,
    };
    if (input.tools?.length) {
      body.tools = input.tools;
      body.tool_choice = "auto";
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...(cfg.baseUrl.includes("openrouter")
          ? {
              "HTTP-Referer":
                process.env.NEXT_PUBLIC_APP_URL || "https://ragnarok-donna-app.kxryyk.easypanel.host",
              "X-Title": "Donna Barbearia",
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[llm] HTTP", res.status, errText.slice(0, 300));
      if (res.status === 401 || res.status === 403) {
        llmDisabledReason = `auth_${res.status}`;
      }
      return null;
    }

    const json = (await res.json()) as {
      model?: string;
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: ToolCall[];
        };
      }[];
    };

    const msg = json.choices?.[0]?.message;
    return {
      content: msg?.content?.trim() || null,
      toolCalls: msg?.tool_calls ?? [],
      model: json.model || model,
    };
  } catch (err) {
    console.warn("[llm] falhou", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
