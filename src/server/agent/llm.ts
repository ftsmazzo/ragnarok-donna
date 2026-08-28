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

function llmHeaders(cfg: NonNullable<ReturnType<typeof getLlmConfig>>) {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
    ...(cfg.baseUrl.includes("openrouter")
      ? {
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_APP_URL || "https://ragnarok-donna-app.kxryyk.easypanel.host",
          "X-Title": "Donna Barbearia",
        }
      : {}),
  };
}

function audioFormatFromMimetype(mimetype: string): string {
  const m = mimetype.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  if (m.includes("aac")) return "aac";
  if (m.includes("flac")) return "flac";
  return "ogg";
}

/** Transcreve áudio WhatsApp (OGG/MP3) para texto. */
export async function transcribeAudio(input: {
  base64: string;
  mimetype: string;
}): Promise<string | null> {
  const cleanBase64 = input.base64.replace(/^data:[^;]+;base64,/, "");
  const format = audioFormatFromMimetype(input.mimetype);
  const sttModel =
    process.env.LLM_STT_MODEL?.trim() || "openai/whisper-large-v3";

  const cfg = getLlmConfig();
  if (cfg) {
    try {
      const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: llmHeaders(cfg),
        body: JSON.stringify({
          model: sttModel,
          language: "pt",
          input_audio: {
            data: cleanBase64,
            format,
          },
        }),
        cache: "no-store",
      });

      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        const text = json.text?.trim();
        if (text) return text;
      } else {
        console.warn("[llm] STT HTTP", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.warn("[llm] STT falhou", err instanceof Error ? err.message : err);
    }
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    const buffer = Buffer.from(cleanBase64, "base64");
    const ext = format === "mp3" ? "mp3" : "ogg";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: input.mimetype }), `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "pt");

    try {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: form,
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn("[llm] whisper HTTP", res.status, await res.text().catch(() => ""));
        return null;
      }
      const json = (await res.json()) as { text?: string };
      return json.text?.trim() || null;
    } catch (err) {
      console.warn("[llm] whisper falhou", err instanceof Error ? err.message : err);
    }
  }

  return null;
}

/** Descreve imagem recebida no WhatsApp (referência visual para a Donna). */
export async function describeImage(input: {
  dataUrl: string;
  caption?: string;
  model?: string | null;
}): Promise<string | null> {
  const cfg = getLlmConfig();
  if (!cfg) return null;

  const model =
    input.model ||
    process.env.LLM_VISION_MODEL?.trim() ||
    (cfg.baseUrl.includes("openrouter") ? "google/gemini-2.5-flash-preview" : "gpt-4.1");

  const prompt = input.caption?.trim()
    ? `O cliente enviou uma imagem com a legenda: "${input.caption}". Descreva a imagem em 1-3 frases curtas (o que aparece, contexto útil para uma recepção de barbearia).`
    : "Descreva esta imagem enviada por um cliente no WhatsApp em 1-3 frases curtas (o que aparece, contexto útil para uma recepção de barbearia).";

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: llmHeaders(cfg),
      body: JSON.stringify({
        model: resolveModelId(model),
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: input.dataUrl } },
            ],
          },
        ],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("[llm] vision HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn("[llm] vision falhou", err instanceof Error ? err.message : err);
    return null;
  }
}

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
      headers: llmHeaders(cfg),
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
