import type { SupportGuide } from "./types";

export const guideRelatoriosVisao: SupportGuide = {
  id: "relatorios-visao",
  title: "Relatórios — visão geral",
  status: "skeleton",
  href: "/relatorios",
  menuPath: "Relatórios → Visão geral",
  aliases: ["relatório", "relatorios", "visão geral", "dashboard"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Painel consolidado de indicadores da unidade/rede.",
  steps: [],
  objections: [],
  relatedGuideIds: [
    "relatorio-agendamentos",
    "relatorio-financeiro",
    "relatorio-comandas",
  ],
  lastVerified: null,
};

export const guideAlertas: SupportGuide = {
  id: "alertas",
  title: "Alertas",
  status: "skeleton",
  href: "/alertas",
  menuPath: "Relatórios → Alertas",
  aliases: ["alerta", "alertas", "aviso"],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica"],
  summary: "Avisos operacionais que pedem atenção.",
  steps: [],
  objections: [],
  relatedGuideIds: ["relatorios-visao"],
  lastVerified: null,
};

export const guideRelatorioAgendamentos: SupportGuide = {
  id: "relatorio-agendamentos",
  title: "Relatório de agendamentos",
  status: "skeleton",
  href: "/relatorios/agendamentos",
  menuPath: "Relatórios → Agendamentos",
  aliases: ["relatório agenda", "agendamentos relatório"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Métricas e listagens de agendamentos no período.",
  steps: [],
  objections: [],
  relatedGuideIds: ["agenda"],
  lastVerified: null,
};

export const guideRelatorioFinanceiro: SupportGuide = {
  id: "relatorio-financeiro",
  title: "Relatório financeiro",
  status: "skeleton",
  href: "/relatorios/financeiro",
  menuPath: "Relatórios → Financeiro",
  aliases: ["relatório financeiro", "faturamento", "receita"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Receitas e indicadores financeiros do período.",
  steps: [],
  objections: [],
  relatedGuideIds: ["caixa", "fluxo-caixa", "comandas"],
  lastVerified: null,
};

export const guideRelatorioComandas: SupportGuide = {
  id: "relatorio-comandas",
  title: "Relatório de comandas",
  status: "skeleton",
  href: "/relatorios/comandas",
  menuPath: "Relatórios → Comandas",
  aliases: ["relatório comanda", "ticket médio"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Volume e valores de comandas no período.",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas", "comandas-historico"],
  lastVerified: null,
};

export const guideRelatorioEstoque: SupportGuide = {
  id: "relatorio-estoque",
  title: "Relatório de estoque",
  status: "skeleton",
  href: "/relatorios/estoque",
  menuPath: "Relatórios → Estoque",
  aliases: ["estoque relatório", "ruptura", "mínimo"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Posição e alertas de estoque.",
  steps: [],
  objections: [],
  relatedGuideIds: ["produtos", "consumo-pwa"],
  lastVerified: null,
};

export const guideRelatorioExtras: SupportGuide = {
  id: "relatorio-extras",
  title: "Extras / metas",
  status: "skeleton",
  href: "/relatorios/extras",
  menuPath: "Relatórios → Extras / metas",
  aliases: ["metas", "extras", "meta barbeiro"],
  roles: ["owner", "admin", "staff"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Acompanhamento de metas e extras dos profissionais.",
  steps: [],
  objections: [],
  relatedGuideIds: ["comissoes", "profissionais"],
  lastVerified: null,
};

export const guideRelatorioPerfil: SupportGuide = {
  id: "relatorio-perfil",
  title: "Perfil do cliente (relatório)",
  status: "skeleton",
  href: "/relatorios/perfil",
  menuPath: "Relatórios → Perfil do cliente",
  aliases: ["perfil cliente", "rfm", "retenção"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Análise de comportamento/consumo dos clientes.",
  steps: [],
  objections: [],
  relatedGuideIds: ["clientes"],
  lastVerified: null,
};
