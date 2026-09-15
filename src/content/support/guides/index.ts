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
 * Catálogo completo do guia de suporte (esqueleto).
 * Enriquecer sprint a sprint: status skeleton → draft → ready.
 * Quando ready, o agente passa a preferir get_guide em vez de FAQ solto.
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

export function listGuidesByStatus(status: GuideStatus): SupportGuide[] {
  return SUPPORT_GUIDES.filter((g) => g.status === status);
}

export function getGuideById(id: string): SupportGuide | undefined {
  return SUPPORT_GUIDES.find((g) => g.id === id);
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
