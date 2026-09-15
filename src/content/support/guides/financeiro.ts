import type { SupportGuide } from "./types";

export const guideCaixa: SupportGuide = {
  id: "caixa",
  title: "Caixa do dia",
  status: "skeleton",
  href: "/caixa",
  menuPath: "Financeiro → Caixa",
  aliases: ["caixa", "sangria", "suprimento", "dinheiro do dia"],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer", "como_gerar"],
  summary: "Movimentações do caixa da unidade (entradas/saídas do dia).",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas", "fluxo-caixa", "contas"],
  lastVerified: null,
};

export const guideComissoes: SupportGuide = {
  id: "comissoes",
  title: "Comissões",
  status: "skeleton",
  href: "/comissoes",
  menuPath: "Financeiro → Comissões",
  aliases: ["comissão", "comissões", "repasse", "pagamento barbeiro"],
  roles: ["owner", "admin", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary: "Comissão por item (serviço, produto, pacote, crédito com preço de tabela).",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas", "pacotes", "consumo-pwa", "profissionais"],
  lastVerified: null,
  enrichNotes: [
    "Barbeiro vê as próprias; dono vê todos",
    "Crédito de pacote: comissão no preço de tabela",
    "Consumo −30%",
  ],
};

export const guideFluxoCaixa: SupportGuide = {
  id: "fluxo-caixa",
  title: "Fluxo de caixa",
  status: "skeleton",
  href: "/relatorios/fluxo",
  menuPath: "Financeiro → Fluxo de caixa",
  aliases: ["fluxo", "fluxo de caixa", "entrada saída"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Visão de entradas e saídas no tempo.",
  steps: [],
  objections: [],
  relatedGuideIds: ["caixa", "relatorio-financeiro", "contas"],
  lastVerified: null,
};

export const guideContas: SupportGuide = {
  id: "contas",
  title: "Contas a pagar / receber",
  status: "skeleton",
  href: "/contas",
  menuPath: "Financeiro → Contas",
  aliases: ["contas", "contas a pagar", "contas a receber", "boleto"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer"],
  summary: "Lançamentos de contas da unidade.",
  steps: [],
  objections: [],
  relatedGuideIds: ["caixa", "fluxo-caixa"],
  lastVerified: null,
};
