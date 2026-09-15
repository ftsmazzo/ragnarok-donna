import type { GuideStatus, SupportGuide } from "./types";
import { guideAgenda, guideListaEspera } from "./agenda";
import {
  guideClientes,
  guidePacotes,
  guideProdutos,
  guideProfissionais,
  guideServicos,
} from "./cadastros";
import {
  guideComandas,
  guideComandasHistorico,
  guideConsumoPwa,
} from "./comandas";
import {
  guideAgenteDonna,
  guideConversasIa,
  guideDisparos,
  guideEmpresa,
  guideEquipeAcesso,
  guideInicio,
  guideMinhaConta,
  guidePwaApp,
} from "./config";
import {
  guideCaixa,
  guideComissoes,
  guideContas,
  guideFluxoCaixa,
} from "./financeiro";
import {
  guideAlertas,
  guideRelatorioAgendamentos,
  guideRelatorioComandas,
  guideRelatorioEstoque,
  guideRelatorioExtras,
  guideRelatorioFinanceiro,
  guideRelatorioPerfil,
  guideRelatoriosVisao,
} from "./relatorios";

/**
 * Catálogo do guia de suporte.
 * Agente (S9) consome status draft|ready via search_guides / get_guide.
 */
export const SUPPORT_GUIDES: SupportGuide[] = [
  guideInicio,
  guideAgenda,
  guideListaEspera,
  guideClientes,
  guideProfissionais,
  guideServicos,
  guideProdutos,
  guidePacotes,
  guideComandas,
  guideComandasHistorico,
  guideConsumoPwa,
  guideCaixa,
  guideComissoes,
  guideFluxoCaixa,
  guideContas,
  guideRelatoriosVisao,
  guideAlertas,
  guideRelatorioAgendamentos,
  guideRelatorioFinanceiro,
  guideRelatorioComandas,
  guideRelatorioEstoque,
  guideRelatorioExtras,
  guideRelatorioPerfil,
  guideConversasIa,
  guideEmpresa,
  guideEquipeAcesso,
  guideMinhaConta,
  guideAgenteDonna,
  guideDisparos,
  guidePwaApp,
];

const AGENT_STATUSES: GuideStatus[] = ["draft", "ready"];

export function listGuidesByStatus(status: GuideStatus): SupportGuide[] {
  return SUPPORT_GUIDES.filter((g) => g.status === status);
}

export function getGuideById(id: string): SupportGuide | undefined {
  return SUPPORT_GUIDES.find((g) => g.id === id);
}

/** Guias que o agente pode citar (exclui skeleton vazio). */
export function listAgentGuides(): SupportGuide[] {
  return SUPPORT_GUIDES.filter((g) => AGENT_STATUSES.includes(g.status));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function scoreText(query: string, haystack: string): number {
  const q = normalize(query);
  const h = normalize(haystack);
  if (!q || !h) return 0;
  if (h.includes(q)) return 10;
  const parts = q.split(/\s+/).filter((p) => p.length > 2);
  let score = 0;
  for (const p of parts) {
    if (h.includes(p)) score += 2;
  }
  return score;
}

function scoreGuide(query: string, guide: SupportGuide): number {
  let score =
    scoreText(query, guide.title) * 4 +
    scoreText(query, guide.summary) * 2 +
    scoreText(query, guide.menuPath) * 2 +
    scoreText(query, guide.id) * 3;
  for (const alias of guide.aliases) {
    const a = scoreText(query, alias);
    score += a * 3;
    if (normalize(query) === normalize(alias)) score += 20;
  }
  for (const step of guide.steps) {
    score += scoreText(query, step.title) + scoreText(query, step.detail);
  }
  for (const obj of guide.objections) {
    score += scoreText(query, obj.concern) * 2 + scoreText(query, obj.reply);
  }
  if (guide.status === "ready") score += 2;
  return score;
}

export type GuideSearchHit = {
  id: string;
  title: string;
  menuPath: string;
  href: string;
  summary: string;
  status: GuideStatus;
};

/** Busca resumida para o agente escolher o guia. */
export function searchGuides(query: string, limit = 5): GuideSearchHit[] {
  const scored = listAgentGuides()
    .map((g) => ({ guide: g, score: scoreGuide(query, g) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ guide }) => ({
    id: guide.id,
    title: guide.title,
    menuPath: guide.menuPath,
    href: guide.href,
    summary: guide.summary,
    status: guide.status,
  }));
}

/** Payload completo do guia para o agente responder (sem enrichNotes). */
export function getGuidePayload(id: string) {
  const guide = getGuideById(id.trim());
  if (!guide || !AGENT_STATUSES.includes(guide.status)) {
    return null;
  }
  return {
    id: guide.id,
    title: guide.title,
    status: guide.status,
    href: guide.href,
    menuPath: guide.menuPath,
    summary: guide.summary,
    steps: guide.steps,
    objections: guide.objections,
    relatedGuideIds: guide.relatedGuideIds,
    lastVerified: guide.lastVerified,
  };
}

export function guideCoverage() {
  const total = SUPPORT_GUIDES.length;
  const byStatus = {
    skeleton: listGuidesByStatus("skeleton").length,
    draft: listGuidesByStatus("draft").length,
    ready: listGuidesByStatus("ready").length,
  };
  return { total, byStatus };
}

export type { SupportGuide, GuideStatus } from "./types";
