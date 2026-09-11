import type { ChatToolDef } from "@/server/agent/llm";
import { getFeatureHint, searchHelp } from "./knowledge";

export const SUPPORT_TOOL_DEFS: ChatToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_help",
      description: "Busca no FAQ do produto respostas sobre como operar o app.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Pergunta ou palavras-chave" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_feature_hint",
      description: "Indica onde fica uma função no menu do painel.",
      parameters: {
        type: "object",
        properties: {
          feature: { type: "string", description: "Nome da tela/função (ex.: comanda, consumo)" },
        },
        required: ["feature"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_human",
      description: "Pede atendimento humano da Fábrica IA. Use quando a pessoa pedir ou quando você não souber.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Motivo curto do handoff" },
        },
        required: ["reason"],
      },
    },
  },
];

export type SupportToolResult = {
  ok: boolean;
  data: Record<string, unknown>;
  /** Se true, o orquestrador deve marcar a thread como human. */
  escalate?: boolean;
  escalateReason?: string;
};

export function executeSupportTool(
  name: string,
  args: Record<string, unknown>
): SupportToolResult {
  if (name === "search_help") {
    const query = String(args.query ?? "").trim();
    const hits = searchHelp(query);
    return {
      ok: true,
      data: {
        query,
        hits: hits.map((h) => ({
          id: h.id,
          question: h.question,
          answer: h.answer,
          menuPath: h.menuPath ?? null,
        })),
      },
    };
  }

  if (name === "get_feature_hint") {
    const feature = String(args.feature ?? "").trim();
    const hint = getFeatureHint(feature);
    return {
      ok: Boolean(hint),
      data: hint
        ? {
            title: hint.title,
            where: hint.where,
            tip: hint.tip ?? null,
          }
        : { message: "Não achei esse item no mapa do menu." },
    };
  }

  if (name === "escalate_human") {
    const reason = String(args.reason ?? "Pedido de humano").trim() || "Pedido de humano";
    return {
      ok: true,
      escalate: true,
      escalateReason: reason,
      data: { reason, queued: true },
    };
  }

  return { ok: false, data: { error: `Tool desconhecida: ${name}` } };
}
