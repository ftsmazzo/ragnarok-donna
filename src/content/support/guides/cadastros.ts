import type { SupportGuide } from "./types";

/** S5 — enriquecido a partir de Clientes/Staff/Catalog drawers. */
export const guideClientes: SupportGuide = {
  id: "clientes",
  title: "Clientes",
  status: "draft",
  href: "/clientes",
  menuPath: "Cadastros → Clientes",
  aliases: [
    "cliente",
    "clientes",
    "ficha",
    "cadastro cliente",
    "foto cliente",
    "indicação",
    "por onde conheceu",
    "inativar cliente",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary:
    "Cadastro e ficha do cliente: dados, foto, origem, histórico de agenda/comandas e carteira de pacotes.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Cadastros → Clientes (/clientes). Busca por nome, telefone ou e-mail. Filtros: Ativos, Removidos, Todos.",
    },
    {
      title: "Novo cliente",
      detail:
        "Botão + Novo cliente → preencha nome (obrigatório), telefone, e-mail, foto, por onde conheceu, indicação, nascimento, observações → Salvar.",
    },
    {
      title: "Ficha (abas)",
      detail:
        "Clique no cliente: Resumo (totais e créditos), Cadastro, Pacotes (saldo/repor/renovar), Agenda, Comandas, Consumo. Edite o cadastro na aba Cadastro e Salvar.",
    },
    {
      title: "Foto",
      detail:
        "No cadastro (ou no drawer do agendamento), envie a foto. Ela aparece na grade da Agenda.",
    },
    {
      title: "Por onde conheceu",
      detail:
        "Campo no cadastro: Indicação, Instagram, Google, Passou na frente, WhatsApp, Outro — útil para marketing.",
    },
    {
      title: "Inativar / reativar",
      detail:
        "Na ficha: Inativar (some dos Ativos; fica em Removidos). Removidos → abrir → Reativar.",
    },
  ],
  objections: [
    {
      concern: "Cadastrei e não acho mais",
      reply:
        "Confira o filtro (Ativos vs Removidos vs Todos) e a busca. Cliente inativado não aparece em Ativos.",
    },
    {
      concern: "Onde vejo se tem pacote?",
      reply:
        "Abra a ficha → aba Pacotes (ou o resumo de créditos no Resumo). Detalhes no guia Pacotes.",
    },
  ],
  relatedGuideIds: ["pacotes", "agenda", "comandas"],
  lastVerified: "2026-09-15",
};

export const guideProfissionais: SupportGuide = {
  id: "profissionais",
  title: "Profissionais",
  status: "draft",
  href: "/profissionais",
  menuPath: "Cadastros → Profissionais",
  aliases: [
    "barbeiro",
    "profissional",
    "profissionais",
    "jornada",
    "comissão padrão",
    "agendável",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "Quem atende na agenda: dados, comissão padrão, se aparece na grade (jornada) e performance.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Cadastros → Profissionais (/profissionais). Barbeiro costuma ir direto à própria ficha.",
    },
    {
      title: "Cadastro",
      detail:
        "Novo ou clique na linha: nome, apelido, contato, foto/cor, comissão padrão (%), se está ativo e se é agendável (aparece na Agenda).",
    },
    {
      title: "Jornada",
      detail:
        "Na ficha do profissional → aba Jornada: horários por dia da semana (até 2 faixas/dia). Sem jornada no dia, a agenda não inventa horário — o profissional fica sem slots.",
    },
    {
      title: "Performance",
      detail:
        "Aba Performance (quando disponível): visão de comandas/comissões do profissional.",
    },
    {
      title: "Login do barbeiro",
      detail:
        "O cadastro de profissional não cria login sozinho. Vincule em Configurações → Equipe de acesso (e-mail + papel + profissional).",
    },
  ],
  objections: [
    {
      concern: "Profissional não aparece na agenda",
      reply:
        "Confira se está ativo, agendável e com jornada no dia. Sem faixa de horário naquele weekday, não há grade.",
    },
    {
      concern: "Barbeiro não consegue entrar / ver só as comissões",
      reply:
        "Equipe de acesso precisa vincular o usuário ao profissional. Sem vínculo, consumo e “minhas comissões” falham.",
    },
  ],
  relatedGuideIds: ["equipe-acesso", "servicos", "comissoes", "agenda"],
  lastVerified: "2026-09-15",
};

export const guideServicos: SupportGuide = {
  id: "servicos",
  title: "Serviços",
  status: "draft",
  href: "/servicos",
  menuPath: "Cadastros → Serviços",
  aliases: ["serviço", "serviços", "corte", "barba", "duração", "preço", "agendável online"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary: "Catálogo de serviços: preço, duração, comissão % e se pode agendar online.",
  steps: [
    {
      title: "Onde fica",
      detail: "Menu → Cadastros → Serviços (/servicos). Busca por nome.",
    },
    {
      title: "Novo / editar",
      detail:
        "Clique ou + Novo serviço: nome, duração (min), preço, comissão (%), agendável online. Salvar.",
    },
    {
      title: "Onde o serviço é usado",
      detail:
        "Agenda (marcar horário), comanda (lançar item), pacotes (créditos de serviço) e comissão do item.",
    },
  ],
  objections: [
    {
      concern: "Mudei o preço e a comissão antiga ficou estranha",
      reply:
        "Itens já lançados na comanda guardam o valor daquele momento. Novos lançamentos usam o preço/comissão atuais.",
    },
    {
      concern: "Serviço não entra no pacote / na venda",
      reply:
        "No pacote, vincule o serviço na edição do pacote. Na comanda, o serviço precisa estar ativo.",
    },
  ],
  relatedGuideIds: ["pacotes", "agenda", "comandas", "comissoes"],
  lastVerified: "2026-09-15",
};

export const guideProdutos: SupportGuide = {
  id: "produtos",
  title: "Produtos",
  status: "draft",
  href: "/produtos",
  menuPath: "Cadastros → Produtos",
  aliases: [
    "produto",
    "produtos",
    "estoque",
    "sku",
    "uso interno",
    "para venda",
  ],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary: "Catálogo e estoque: venda na comanda/PWA, uso interno e mínimos.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Cadastros → Produtos (/produtos). Busca por nome, categoria, marca ou SKU.",
    },
    {
      title: "Novo / editar",
      detail:
        "Nome, categoria, marca, SKU, preço, estoque, estoque mínimo, disponível para venda, uso interno. Comissão % se houver no cadastro.",
    },
    {
      title: "Venda",
      detail:
        "Marcado para venda: entra na comanda (Tipo Produto) e na aba Venda do celular (/pwa/consumo). Baixa estoque ao lançar.",
    },
    {
      title: "Uso interno",
      detail:
        "Marque Uso interno. Na lista de produtos, use a ação de baixar 1 un. (confirmação). Não gera comanda nem desconto de barbeiro — só baixa estoque.",
    },
    {
      title: "Pacote com produto",
      detail:
        "No cadastro do pacote dá para incluir produto como crédito. Abate na comanda ao lançar o produto com crédito marcado.",
    },
  ],
  objections: [
    {
      concern: "Produto não aparece no celular",
      reply:
        "Precisa estar ativo, para venda e com estoque > 0. Confira Cadastros → Produtos.",
    },
    {
      concern: "Onde baixo produto da casa (algodão, etc.)?",
      reply:
        "Cadastros → Produtos → marque Uso interno → baixar 1 un. na lista. Não use Meu consumo (isso desconta comissão).",
    },
  ],
  relatedGuideIds: ["consumo-pwa", "comandas", "pacotes", "relatorio-estoque"],
  lastVerified: "2026-09-15",
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

