import type { SupportGuide } from "./types";

/** PLACEHOLDER — enriquecer na sprint Comandas */
export const guideComandas: SupportGuide = {
  id: "comandas",
  title: "Comandas (abrir, itens, pagar, fechar)",
  status: "skeleton",
  href: "/comandas",
  menuPath: "Comandas → Abertas",
  aliases: [
    "comanda",
    "comandas",
    "abrir comanda",
    "fechar comanda",
    "pagar",
    "pagamento",
    "pix",
    "cartão",
    "link rede",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary: "Hub financeiro do atendimento: lançar serviços/produtos/pacotes e receber.",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas-historico", "pacotes", "consumo-pwa", "caixa"],
  lastVerified: null,
  enrichNotes: [
    "Abrir pela agenda vs Comandas → Abertas",
    "Drawer: itens, desconto, carteira de pacote, pagar e fechar",
    "Métodos: cash, pix, pix_key, debit, credit, rede_link, infinity…",
    "Saldo > 0 bloqueia fechar",
    "Barbeiro: o que pode / não pode",
  ],
};

export const guideComandasHistorico: SupportGuide = {
  id: "comandas-historico",
  title: "Histórico e reabrir comanda",
  status: "skeleton",
  href: "/comandas/historico",
  menuPath: "Comandas → Histórico",
  aliases: ["histórico", "comanda fechada", "reabrir", "reabrir comanda"],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary: "Consultar comandas fechadas/canceladas e reabrir (dono/admin).",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas", "comissoes"],
  lastVerified: null,
  enrichNotes: [
    "Corrigir tip antigo: comanda FECHADA pode reabrir (dono/admin)",
    "Pagamentos já lançados permanecem; fecha de novo só o saldo",
  ],
};

export const guideConsumoPwa: SupportGuide = {
  id: "consumo-pwa",
  title: "Venda / Consumo no celular",
  status: "skeleton",
  href: "/pwa/consumo",
  menuPath: "Comandas → Venda / Consumo (celular)",
  aliases: ["consumo", "meu consumo", "uso interno", "pwa consumo", "coca", "trufa"],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary: "Lançar venda rápida, consumo do barbeiro (−30%) e uso interno.",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas", "produtos", "comissoes"],
  lastVerified: null,
  enrichNotes: ["Meu consumo vs venda cliente vs uso interno (dona)"],
};
