import type { SupportGuide } from "./types";

/** S5 — enriquecido a partir de Clientes/Staff/Catalog drawers. */
export const guideClientes: SupportGuide = {
  id: "clientes",
  title: "Clientes",
  status: "ready",
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
    "carteira cliente",
    "histórico cliente",
    "conta do cliente",
    "crédito cliente",
    "fiado",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary:
    "Cadastro e ficha do cliente: dados, foto, origem, Conta do Cliente (crédito/débito), histórico e carteira de pacotes.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Cadastros → Clientes (/clientes). Busca por nome, telefone ou e-mail. Filtros: Ativos, Removidos, Todos. A coluna Conta mostra saldo ≠ 0.",
    },
    {
      title: "Novo cliente",
      detail:
        "Botão + Novo cliente → nome (obrigatório), telefone, e-mail, foto, por onde conheceu, indicação, nascimento, observações → Salvar. Telefone ajuda follow-up Zap em Relatórios → Perfil.",
    },
    {
      title: "Ficha — abas",
      detail:
        "Clique no cliente: Resumo (totais, Conta do Cliente e créditos), Cadastro, Conta (+crédito/+débito e extrato), Pacotes, Agenda, Comandas, Consumo.",
    },
    {
      title: "Conta do Cliente",
      detail:
        "Aba Conta: saldo positivo = crédito pré-pago; negativo = débito/fiado. Lance +Crédito ou +Débito com valor e observação. Na comanda, use forma Conta do cliente para abater crédito, ou “Lançar na conta e fechar” para deixar o restante como fiado.",
    },
    {
      title: "Vender pacote pela ficha",
      detail:
        "Aba Pacotes → Vender pacote (se houver pacote vendável). Modal: pacote, obs, expiração, forma de pagamento e Comprar. Alternativa: Cadastros → Pacotes → Vender pacote (escolhe o cliente ali).",
    },
    {
      title: "Carteira e comanda",
      detail:
        "Na aba Pacotes: remaining/total, validade, Repor créditos, Renovar (nova venda), Abrir comanda. Sem venda ainda, a lista fica vazia até o primeiro pacote.",
    },
    {
      title: "Foto",
      detail:
        "No cadastro (ou no drawer do agendamento), envie a foto. Ela aparece na grade da Agenda.",
    },
    {
      title: "Por onde conheceu",
      detail:
        "Campo no cadastro: Indicação, Instagram, Google, Passou na frente, WhatsApp, Outro — útil para marketing / perfil.",
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
        "Ficha → aba Pacotes (ou créditos no Resumo). Na comanda aberta, o bloco Carteira de pacotes no topo lista o que dá para abater.",
    },
    {
      concern: "Botão Vender pacote não aparece na ficha",
      reply:
        "Só lista pacotes vendáveis (serviço/produto vinculado). Em Cadastros → Pacotes, corrija os que estão com “serviço sem vínculo” e salve.",
    },
    {
      concern: "Sem telefone no follow-up / Zap",
      reply:
        "Cadastre o celular na aba Cadastro. Relatório → Perfil e Conversas usam esse número.",
    },
  ],
  relatedGuideIds: ["pacotes", "agenda", "comandas", "relatorio-perfil"],
  lastVerified: "2026-09-15",
};

export const guideProfissionais: SupportGuide = {
  id: "profissionais",
  title: "Profissionais",
  status: "ready",
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
  status: "ready",
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
  status: "ready",
  href: "/produtos",
  menuPath: "Cadastros → Produtos",
  aliases: [
    "produto",
    "produtos",
    "estoque",
    "sku",
    "uso interno",
    "para venda",
    "não aparece na comanda",
    "trufa",
    "saldo estoque",
  ],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary: "Catálogo e estoque: venda na comanda/PWA, uso interno e mínimos.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Cadastros → Produtos (/produtos). Busca por nome, categoria, marca ou SKU. Coluna “À venda” mostra se entra na comanda.",
    },
    {
      title: "Novo / editar",
      detail:
        "Nome, categoria, marca, SKU, preço, estoque, estoque mínimo, disponível para venda, uso interno. Comissão % se houver no cadastro.",
    },
    {
      title: "Venda na comanda / PWA",
      detail:
        "Marcado para venda (for_sale): entra na comanda (Tipo Produto) e na aba Venda do celular (/pwa/consumo). Baixa estoque ao lançar. Sem essa marca, o produto existe no cadastro/relatório mas some do lançamento.",
    },
    {
      title: "Uso interno",
      detail:
        "Marque Uso interno. Na lista, ação de baixar 1 un. (confirmação). Não gera comanda nem desconto de barbeiro — só baixa estoque. Itens só de uso (ex. Hidro Nutrição) não precisam aparecer na venda.",
    },
    {
      title: "Pacote com produto",
      detail:
        "No cadastro do pacote dá para incluir produto como crédito. Abate na comanda ao lançar o produto com crédito marcado.",
    },
    {
      title: "Relatório de estoque",
      detail:
        "Relatórios → Estoque: saldo, mínimo, Barbearia/Bar, abaixo do mínimo. Se o saldo do relatório da loja diferir do app, ajuste o estoque aqui ou regenere o período.",
    },
  ],
  objections: [
    {
      concern: "Produto não aparece na comanda / no celular",
      reply:
        "Abra Cadastros → Produtos → edite: precisa estar ativo e marcado para venda. Estoque 0 ainda lista na comanda do painel, mas o PWA de venda costuma exigir estoque > 0.",
    },
    {
      concern: "Está no relatório de estoque e não acho no lançamento",
      reply:
        "Relatório lista o cadastro; a comanda só mostra “à venda”. Marque Disponível para venda e salve (caso clássico após import com flag zerada).",
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
  status: "ready",
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
    "diferença",
    "cobertura do pacote",
    "comprar pacote",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer", "como_gerar", "objecao"],
  summary:
    "Catálogo de pacotes; venda densa (modal Comprar); carteira; abate + diferença/desconto; repor/renovar.",
  steps: [
    {
      title: "Onde fica o catálogo",
      detail:
        "Menu → Cadastros → Pacotes (/pacotes). Cadastre nome, preço, validade (dias), comissão pela venda (%) e itens (serviços e/ou produtos com quantidade). Botão Vender pacote no topo quando há pacote vendável.",
    },
    {
      title: "Cadastrar ou corrigir pacote",
      detail:
        "Novo pacote ou clique na linha. Inclua ao menos um serviço ou produto. Pacotes importados sem vínculo mostram aviso (“serviço não vinculado”) — selecione o serviço e salve para voltarem em Vender pacote e na comanda.",
    },
    {
      title: "Venda densa (modal Comprar)",
      detail:
        "Cadastros → Pacotes → Vender pacote, ou ficha do cliente → aba Pacotes → Vender pacote. Modal: cliente (se ainda não veio da ficha), pacote, preview (itens/valor/obs/expiração), + Formas de pagamento, opcional “Pagar e liberar carteira agora” → Comprar. Toast de sucesso ao concluir.",
    },
    {
      title: "Venda pela comanda",
      detail:
        "Comanda com cliente vinculado: Tipo → Vender pacote → pacote → Vender pacote / gerar carteira. Valor entra no total. Créditos só liberam ao pagar/fechar (badge “libera ao fechar”), salvo se usou o fluxo do modal com pagar na hora.",
    },
    {
      title: "Ver saldo do cliente",
      detail:
        "Clientes → ficha → aba Pacotes (e Resumo). Na comanda aberta, bloco Carteira de pacotes no topo. Atalho Abrir comanda na ficha.",
    },
    {
      title: "Abater crédito (e diferença)",
      detail:
        "Ao lançar serviço/produto coberto, “Abater 1 crédito” vem marcado. Cobertura do pacote (R$) default = preço de tabela (100%). Se a cobertura for menor, o residual é a diferença a pagar (badge Crédito + diferença). Desconto % no item continua visível e aplica só no residual — não substitui o abate. Desmarque o crédito só para cobrar avulso. Comissão do serviço fica no preço de tabela.",
    },
    {
      title: "Desconto da comanda",
      detail:
        "No rodapé do drawer: Desconto da comanda (%) → o painel calcula o R$ sobre o subtotal → Aplicar. É outro mecanismo: reduz o total a pagar da comanda, não “vira” crédito de pacote.",
    },
    {
      title: "Repor créditos",
      detail:
        "Ficha (aba Pacotes) ou carteira da comanda: Repor. Soma de novo a quantidade do pacote e pode estender validade — sem lançar venda nova.",
    },
    {
      title: "Renovar (nova venda)",
      detail:
        "Ficha → Renovar (nova venda). Usa comanda aberta ou abre outra, lança o pacote de novo (valor + comissão). Créditos novos liberam ao fechar/pagar essa comanda.",
    },
  ],
  objections: [
    {
      concern: "Pacote não aparece na lista de venda",
      reply:
        "Cadastros → Pacotes: abra o pacote e vincule o serviço (comum após import). Só ativos com item resolvido entram no modal e na comanda. Empty state na tela explica o aviso de vínculo.",
    },
    {
      concern: "Vendi e o cliente ainda não tem crédito",
      reply:
        "Na comanda clássica: libera só ao Pagar e fechar / Fechar. Até lá o item mostra “libera ao fechar”. No modal, se marcou pagar e liberar agora, a carteira sobe na hora.",
    },
    {
      concern: "Cobrou o serviço mesmo com pacote",
      reply:
        "Confira se o abate estava marcado e se ainda há crédito daquele serviço. Se a cobertura foi menor que o preço, a diferença a pagar é esperada (não é bug).",
    },
    {
      concern: "Abate e desconto juntos",
      reply:
        "Abate = consome 1 crédito (cobertura em R$). Desconto do item = % comercial no residual (R$ calculado). Desconto da comanda = % no subtotal. São três controles distintos.",
    },
    {
      concern: "Diferença entre repor e renovar",
      reply:
        "Repor: só recoloca créditos (sem cobrar de novo). Renovar: vende o pacote de novo na comanda (entra dinheiro e comissão).",
    },
    {
      concern: "Onde vejo comissão da venda do pacote",
      reply:
        "No cadastro do pacote: Comissão pela venda (%). O item de venda na comanda grava a comissão; escolha profissional no lançamento se precisar. Relatório: Financeiro → Comissões.",
    },
  ],
  relatedGuideIds: ["comandas", "clientes", "servicos", "produtos", "comissoes"],
  lastVerified: "2026-09-15",
};

