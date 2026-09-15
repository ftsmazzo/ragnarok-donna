import type { SupportGuide } from "./types";

export const guideClientes: SupportGuide = {
  id: "clientes",
  title: "Clientes",
  status: "skeleton",
  href: "/clientes",
  menuPath: "Cadastros → Clientes",
  aliases: ["cliente", "clientes", "ficha", "cadastro cliente", "foto cliente"],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer"],
  summary: "Cadastro e ficha do cliente (agenda, comandas, pacotes, consumo).",
  steps: [],
  objections: [],
  relatedGuideIds: ["pacotes", "agenda", "comandas"],
  lastVerified: null,
  enrichNotes: ["Aba Pacotes na ficha; origem/indicação; foto"],
};

export const guideProfissionais: SupportGuide = {
  id: "profissionais",
  title: "Profissionais",
  status: "skeleton",
  href: "/profissionais",
  menuPath: "Cadastros → Profissionais",
  aliases: ["barbeiro", "profissional", "jornada", "comissão padrão"],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "permissao"],
  summary: "Quem atende: dados, jornada, serviços e vínculo com login.",
  steps: [],
  objections: [],
  relatedGuideIds: ["equipe-acesso", "servicos", "comissoes"],
  lastVerified: null,
};

export const guideServicos: SupportGuide = {
  id: "servicos",
  title: "Serviços",
  status: "skeleton",
  href: "/servicos",
  menuPath: "Cadastros → Serviços",
  aliases: ["serviço", "serviços", "corte", "barba", "duração", "preço"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer"],
  summary: "Catálogo de serviços: preço, duração, comissão e agendável online.",
  steps: [],
  objections: [],
  relatedGuideIds: ["pacotes", "agenda", "comissoes"],
  lastVerified: null,
};

export const guideProdutos: SupportGuide = {
  id: "produtos",
  title: "Produtos",
  status: "skeleton",
  href: "/produtos",
  menuPath: "Cadastros → Produtos",
  aliases: ["produto", "produtos", "estoque", "sku"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer"],
  summary: "Catálogo e estoque: venda, uso interno e mínimos.",
  steps: [],
  objections: [],
  relatedGuideIds: ["consumo-pwa", "relatorio-estoque", "pacotes"],
  lastVerified: null,
};

export const guidePacotes: SupportGuide = {
  id: "pacotes",
  title: "Pacotes e créditos",
  status: "skeleton",
  href: "/pacotes",
  menuPath: "Cadastros → Pacotes",
  aliases: [
    "pacote",
    "pacotes",
    "crédito",
    "carteira",
    "repor",
    "renovar",
    "recorrência",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer", "como_gerar", "objecao"],
  summary:
    "Catálogo de pacotes; venda na comanda; carteira na ficha; abate de crédito; repor/renovar.",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas", "clientes", "servicos"],
  lastVerified: null,
  enrichNotes: [
    "Carteira libera ao fechar/pagar a venda",
    "Abate padrão 1 crédito R$ 0",
    "Comissão % na venda do pacote",
    "Produtos dentro do pacote",
  ],
};
