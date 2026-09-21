import type { ChatToolDef } from "@/server/agent/llm";
import type { MemberRole } from "@/server/types";
import { getGuideById, getGuidePayload, searchGuides } from "@/content/support/guides";
import { supportHumanChannelConfigured } from "./channel";
import { getFeatureHint, searchHelp } from "./knowledge";

export const SUPPORT_TOOL_DEFS: ChatToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_guides",
      description:
        "Busca no Guia operacional (fonte preferida). Use ANTES de search_help em dúvidas de como operar o app.",
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
      name: "get_guide",
      description:
        "Carrega o guia completo (passos, objeções, menuPath, href). Chame com o id retornado por search_guides.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Id do guia (ex.: comandas, pacotes, caixa)",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_help",
      description:
        "FAQ legado. Use só se search_guides não achar nada útil, ou para reforço pontual.",
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
      description:
        "Atalho rápido de onde fica no menu. Prefira get_guide quando precisar de passo a passo.",
      parameters: {
        type: "object",
        properties: {
          feature: {
            type: "string",
            description: "Nome da tela/função (ex.: comanda, consumo)",
          },
        },
        required: ["feature"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_human",
      description:
        "Notifica o suporte humano por canal externo. Só se a pessoa pedir ou houver bug real sem resposta no guia/FAQ. Nunca prometa resposta dentro deste chat.",
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
  escalate?: boolean;
  escalateReason?: string;
};

export type SupportToolContext = {
  memberRole?: MemberRole | null;
};

export function executeSupportTool(
  name: string,
  args: Record<string, unknown>,
  ctx?: SupportToolContext
): SupportToolResult {
  const memberRole = ctx?.memberRole ?? null;

  if (name === "search_guides") {
    const query = String(args.query ?? "").trim();
    const hits = searchGuides(query, { memberRole, limit: 5 });
    return {
      ok: true,
      data: {
        query,
        hits,
        instruction:
          hits.length > 0
            ? "Chame get_guide com o id do melhor hit (prefira inRoleScope=true). Na resposta use Markdown [Nome da tela](/rota), nunca só /rota."
            : "Nenhum guia. Tente search_help ou get_feature_hint.",
      },
    };
  }

  if (name === "get_guide") {
    const id = String(args.id ?? "").trim();
    const guide = getGuidePayload(id, { memberRole });
    if (!guide) {
      const known = getGuideById(id);
      return {
        ok: false,
        data: {
          id,
          message: known
            ? "Guia ainda skeleton — sem passos. Use search_help / get_feature_hint."
            : "Guia não encontrado. Use search_guides.",
        },
      };
    }
    return {
      ok: true,
      data: {
        ...guide,
        instruction:
          "Baseie a resposta nestes passos/objeções. Sempre que citar uma tela, use [rótulo](href) — ex.: [Produtos](/produtos), [Comandas](/comandas). Se inRoleScope=false, avise que o perfil de quem pergunta pode não ver o menu — oriente a pedir ao titular/admin.",
      },
    };
  }

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
    const reason =
      String(args.reason ?? "Pedido de humano").trim() || "Pedido de humano";
    if (!supportHumanChannelConfigured()) {
      return {
        ok: true,
        escalate: false,
        data: {
          reason,
          queued: false,
          channelOnline: false,
          instruction:
            "Canal humano offline. NÃO diga que chamou a Fábrica. Responda com search_guides / search_help. Sem fila.",
        },
      };
    }
    return {
      ok: true,
      escalate: true,
      escalateReason: reason,
      data: { reason, queued: true, channelOnline: true },
    };
  }

  return { ok: false, data: { error: `Tool desconhecida: ${name}` } };
}
