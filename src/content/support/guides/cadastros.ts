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
  status: "draft",
  href: "/pacotes",
  menuPath: "Cadastros → Pacotes",
  aliases: [
    "pacote",
    "pacotes",
    "crédito",
    "créditos",
    "carteira",
    "repor",
    "renovar",
    "recorrência",
    "vender pacote",
    "gerar carteira",
    "abate crédito",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer", "como_gerar", "objecao"],
  summary:
    "Catálogo de pacotes; venda na comanda; carteira na ficha do cliente; abate de crédito; repor/renovar.",
  steps: [
    {
      title: "Onde fica o catálogo",
      detail:
        "Menu → Cadastros → Pacotes (/pacotes). Cadastre nome, preço, validade (dias), comissão pela venda (%) e itens (serviços e/ou produtos com quantidade).",
    },
    {
      title: "Cadastrar ou corrigir pacote",
      detail:
        "Novo pacote ou clique na linha para editar. Inclua ao menos um serviço ou produto. Pacotes importados sem serviço vinculado aparecem com aviso — selecione o serviço e salve para voltarem a aparecer na venda da comanda.",
    },
    {
      title: "Vender / gerar carteira",
      detail:
        "Na comanda do cliente: Tipo → Vender pacote → escolha o pacote → Vender pacote / gerar carteira. O valor entra no total da comanda. A carteira só libera ao pagar/fechar (item com badge “libera ao fechar”).",
    },
    {
      title: "Ver saldo do cliente",
      detail:
        "Cadastros → Clientes → abra a ficha → aba Pacotes (também resume no Resumo). Mostra créditos restantes/total, validade e últimos usos. Atalho Abrir comanda. Na comanda aberta, o bloco Carteira de pacotes no topo lista créditos disponíveis.",
    },
    {
      title: "Abater crédito no atendimento",
      detail:
        "Na comanda, ao lançar serviço ou produto coberto, o abate (1 crédito — R$ 0) vem marcado por padrão. Desmarque só para cobrar avulso. Comissão do serviço/produto continua no preço de tabela.",
    },
    {
      title: "Repor créditos",
      detail:
        "Na ficha (aba Pacotes) ou na carteira da comanda: Repor créditos. Soma de novo a quantidade do pacote nos créditos existentes e pode estender a validade — sem lançar venda nova (ajuste operacional).",
    },
    {
      title: "Renovar (nova venda)",
      detail:
        "Na ficha → Renovar (nova venda). Usa comanda aberta do cliente ou abre uma nova, lança o pacote de novo (valor + comissão da venda). Créditos novos liberam ao fechar/pagar essa comanda.",
    },
  ],
  objections: [
    {
      concern: "Pacote não aparece na lista de venda da comanda",
      reply:
        "Em Cadastros → Pacotes, abra o pacote: falta vincular o serviço (comum após import). Salve com os serviços corretos. Só pacotes ativos com pelo menos um item resolvido entram na venda.",
    },
    {
      concern: "Vendi e o cliente ainda não tem crédito",
      reply:
        "Normal: libera só ao Pagar e fechar / Fechar a comanda. Até lá o item mostra “libera ao fechar”.",
    },
    {
      concern: "Cobrou o serviço mesmo com pacote",
      reply:
        "No lançamento, confira se o checkbox de crédito estava marcado (padrão sim). Se desmarcou, cobra avulso. Veja também se ainda há crédito restante na carteira para aquele serviço.",
    },
    {
      concern: "Diferença entre repor e renovar",
      reply:
        "Repor: só recoloca créditos no pacote já existente (sem cobrir de novo). Renovar: vende o pacote de novo na comanda (entra dinheiro e comissão).",
    },
    {
      concern: "Onde vejo comissão da venda do pacote",
      reply:
        "No cadastro do pacote há Comissão pela venda (%). Na comanda, o item de venda do pacote grava a comissão; o profissional da venda entra se você escolher um no lançamento. Relatório em Financeiro → Comissões.",
    },
  ],
  relatedGuideIds: ["comandas", "clientes", "servicos", "produtos", "comissoes"],
  lastVerified: "2026-09-15",
  enrichNotes: ["Promover para ready após validação na recepção"],
};

