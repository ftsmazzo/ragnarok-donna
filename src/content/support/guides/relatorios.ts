import type { SupportGuide } from "./types";

/** S6 — enriquecido a partir das páginas de Relatórios. */
export const guideRelatoriosVisao: SupportGuide = {
  id: "relatorios-visao",
  title: "Relatórios — visão geral",
  status: "draft",
  href: "/relatorios",
  menuPath: "Relatórios → Visão geral",
  aliases: [
    "relatório",
    "relatorios",
    "visão geral",
    "painel gerencial",
    "dashboard",
  ],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar", "objecao", "permissao"],
  summary:
    "Painel gerencial: receita, ticket, agenda, estoque baixo e atalhos para os demais relatórios.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Visão geral (/relatorios). Título na tela: Painel gerencial. Só dono/admin.",
    },
    {
      title: "Filtrar o período",
      detail:
        "Botões Esta semana / Este mês, ou De / Até + Gerar. Sem filtro, usa este mês (1º → hoje, horário de SP).",
    },
    {
      title: "O que aparece",
      detail:
        "Cards de Receita (pagamentos), Ticket médio, Agendamentos e Estoque baixo; gráficos de receita no tempo, mix de pagamento, agenda por status, top serviços e profissionais; bloco O que fazer esta semana.",
    },
    {
      title: "Atalhos",
      detail:
        "Centro de alertas, Abrir em cada alerta, e grade Detalhamentos (Alertas, Agendamentos, Financeiro, Comandas, Estoque, etc.).",
    },
  ],
  objections: [
    {
      concern: "Receita / ticket zerados",
      reply:
        "Receita vem de pagamentos de comandas fechadas no Caixa. Sem fechar comanda, o painel não conta faturamento — mensagem tipicamente: feche comandas no Caixa.",
    },
    {
      concern: "Recepção / barbeiro não vê o painel",
      reply:
        "Visão geral e financeiro são só dono/admin. Manager pode ver Alertas, Agendamentos, Extras e Perfil — não o Painel gerencial.",
    },
  ],
  relatedGuideIds: [
    "alertas",
    "relatorio-agendamentos",
    "relatorio-financeiro",
    "relatorio-comandas",
    "caixa",
  ],
  lastVerified: "2026-09-15",
};

export const guideAlertas: SupportGuide = {
  id: "alertas",
  title: "Alertas",
  status: "draft",
  href: "/alertas",
  menuPath: "Relatórios → Alertas",
  aliases: ["alerta", "alertas", "aviso", "crítico", "comanda aberta"],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "objecao", "permissao"],
  summary:
    "Fila da semana: o que exige ação (estoque, cancelamentos, no-show, follow-up).",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Alertas (/alertas). Título: Alertas operacionais. Dono, admin e manager.",
    },
    {
      title: "Período",
      detail:
        "Não há filtro na tela: sempre a semana civil atual (SP), até hoje.",
    },
    {
      title: "O que aparece",
      detail:
        "Cards Críticos / Atenção / Info / Cancel./no-show; Fila de alertas com Abrir; listas opcionais Perdidos que voltaram e Renovações da semana (link no cliente).",
    },
    {
      title: "Ações",
      detail:
        "Abrir leva à tela relacionada (ex.: estoque). Painel gerencial no header. Perfil nas listas laterais.",
    },
  ],
  objections: [
    {
      concern: "Cliquei Abrir e deu acesso negado",
      reply:
        "Alguns destinos (ex. Estoque) são só dono/admin. Manager vê o alerta, mas não entra em relatórios financeiros/estoque.",
    },
    {
      concern: "Por que alerta de comanda aberta?",
      reply:
        "Comanda aberta há mais de 1 hora gera aviso pra não esquecer de fechar. Feche em Comandas ou pelo fluxo do Caixa.",
    },
  ],
  relatedGuideIds: ["relatorios-visao", "comandas", "relatorio-estoque", "clientes"],
  lastVerified: "2026-09-15",
};

export const guideRelatorioAgendamentos: SupportGuide = {
  id: "relatorio-agendamentos",
  title: "Relatório de agendamentos",
  status: "draft",
  href: "/relatorios/agendamentos",
  menuPath: "Relatórios → Agendamentos",
  aliases: [
    "relatório agenda",
    "agendamentos relatório",
    "no-show",
    "cancelados agenda",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_gerar", "objecao"],
  summary:
    "Volume, status, horários cheios e lista de agendamentos no período (com CSV).",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Agendamentos (/relatorios/agendamentos). Dono, admin, manager e leitura.",
    },
    {
      title: "Filtrar",
      detail:
        "Esta semana / Este mês ou De/Até + Gerar. Status (Todos, Agendado, Confirmado, Realizado, Cancelado, Ausente, Bloqueio). Busca: cliente ou profissional.",
    },
    {
      title: "O que aparece",
      detail:
        "Cards Total, Realizados, Em aberto/confirmados, Cancelados+no-show; distribuição por status; horários mais cheios (8h–19h); tabela com encaixe marcado quando for o caso.",
    },
    {
      title: "Exportar",
      detail: "Botão CSV no cabeçalho (desabilitado se a lista estiver vazia).",
    },
  ],
  objections: [
    {
      concern: "Nenhum agendamento no período",
      reply:
        "Ajuste De/Até ou Status, ou lance horários na Agenda. Bloqueios entram no filtro Bloqueio, não no gráfico de status.",
    },
  ],
  relatedGuideIds: ["agenda", "alertas"],
  lastVerified: "2026-09-15",
};

export const guideRelatorioFinanceiro: SupportGuide = {
  id: "relatorio-financeiro",
  title: "Relatório financeiro",
  status: "draft",
  href: "/relatorios/financeiro",
  menuPath: "Relatórios → Financeiro",
  aliases: [
    "relatório financeiro",
    "faturamento",
    "receita",
    "mix pagamento",
  ],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar", "objecao", "permissao"],
  summary:
    "Receita por pagamentos, ticket, mix de formas e receita por profissional.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Financeiro (/relatorios/financeiro). Só dono/admin.",
    },
    {
      title: "Filtrar",
      detail: "Esta semana / Este mês ou De/Até + Gerar.",
    },
    {
      title: "O que aparece",
      detail:
        "Receita (pagamentos), Ticket médio, Serviços vs produtos, Comandas abertas (ainda no balcão); gráficos no tempo, mix de pagamento, receita por profissional; tabela por forma de pagamento.",
    },
    {
      title: "Exportar",
      detail: "CSV do mix por forma de pagamento.",
    },
  ],
  objections: [
    {
      concern: "Sem pagamentos / receita vazia",
      reply:
        "A receita conta pagamentos registrados ao fechar comanda no Caixa — não basta a comanda existir aberta. Feche no balcão e regenere o período.",
    },
  ],
  relatedGuideIds: ["caixa", "fluxo-caixa", "comandas", "relatorios-visao"],
  lastVerified: "2026-09-15",
};

export const guideRelatorioComandas: SupportGuide = {
  id: "relatorio-comandas",
  title: "Relatório de comandas",
  status: "draft",
  href: "/relatorios/comandas",
  menuPath: "Relatórios → Comandas",
  aliases: ["relatório comanda", "ticket médio", "tempo aberta"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar", "objecao"],
  summary:
    "Volume, ticket, tempo médio aberta e lista de comandas no período.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Comandas (/relatorios/comandas). Só dono/admin.",
    },
    {
      title: "Filtrar",
      detail:
        "Período + Status: Todos, Abertas, Fechadas, Canceladas + Gerar. Paginação na lista.",
    },
    {
      title: "O que aparece",
      detail:
        "Cards Comandas, Itens médios, Ticket médio, Tempo médio aberta (só fechadas); distribuição por status; tabela #, cliente, profissional, abertura/fechamento, itens, total, status. Nesta tela a linha não abre a comanda.",
    },
    {
      title: "Exportar",
      detail: "CSV das linhas do relatório.",
    },
  ],
  objections: [
    {
      concern: "Quero abrir a comanda da lista",
      reply:
        "Este relatório é consulta/CSV. Para editar ou pagar, use Comandas (abertas) ou Histórico de comandas.",
    },
  ],
  relatedGuideIds: ["comandas", "comandas-historico", "caixa"],
  lastVerified: "2026-09-15",
};

export const guideRelatorioEstoque: SupportGuide = {
  id: "relatorio-estoque",
  title: "Relatório de estoque",
  status: "draft",
  href: "/relatorios/estoque",
  menuPath: "Relatórios → Estoque",
  aliases: ["estoque relatório", "ruptura", "mínimo", "abaixo do mínimo"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar", "objecao"],
  summary:
    "Saldo, mínimo, valor parado e top vendidos — barbearia e bar separados.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Estoque (/relatorios/estoque). Só dono/admin.",
    },
    {
      title: "Filtrar",
      detail:
        "Escopo Tudo / Barbearia / Bar; período; Busca (produto, categoria ou marca); Filtro Todos ativos ou Só abaixo do mínimo; Gerar.",
    },
    {
      title: "O que aparece",
      detail:
        "SKUs, Abaixo do mínimo, Valor parado (qtde × preço de venda); saldo por categoria; top vendidos no período; tabela com linha destacada se ≤ mínimo.",
    },
    {
      title: "Exportar",
      detail: "CSV do snapshot de saldo/preço (não só vendas do período).",
    },
  ],
  objections: [
    {
      concern: "Lista vazia",
      reply:
        "Cadastre em Cadastros → Produtos ou troque a aba Barbearia/Bar / filtro de mínimo.",
    },
  ],
  relatedGuideIds: ["produtos", "consumo-pwa", "alertas"],
  lastVerified: "2026-09-15",
};

export const guideRelatorioExtras: SupportGuide = {
  id: "relatorio-extras",
  title: "Extras / metas",
  status: "draft",
  href: "/relatorios/extras",
  menuPath: "Relatórios → Extras / metas",
  aliases: ["metas", "extras", "meta barbeiro", "ranking extras"],
  roles: ["owner", "admin", "staff"],
  intents: ["onde_fica", "como_gerar", "como_fazer", "permissao", "objecao"],
  summary:
    "Ranking de produtos vendidos por profissional (separado de comissão) e metas mensais.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Extras / metas (/relatorios/extras). Dono, admin e manager.",
    },
    {
      title: "Filtrar",
      detail:
        "Esta semana / Este mês ou De/Até + Gerar. Sem período na URL, assume este mês.",
    },
    {
      title: "O que aparece",
      detail:
        "Extras no período, Unidades, Com meta; Ranking extras (profissional, un., extras, meta do mês, progresso %).",
    },
    {
      title: "Cadastrar meta",
      detail:
        "Bloco Cadastrar meta mensal (só quem pode escrever comissão: dono/admin): Profissional, Meta R$/mês, Meta un. opcional → Salvar meta. Manager vê ranking, não edita meta.",
    },
    {
      title: "Exportar",
      detail: "CSV do ranking.",
    },
  ],
  objections: [
    {
      concern: "Progresso não bate com a meta",
      reply:
        "O progresso usa o período filtrado contra a meta do mês. Se filtrar só Esta semana, a % não é o mês cheio.",
    },
  ],
  relatedGuideIds: ["comissoes", "profissionais", "produtos"],
  lastVerified: "2026-09-15",
};

export const guideRelatorioPerfil: SupportGuide = {
  id: "relatorio-perfil",
  title: "Perfil do cliente (relatório)",
  status: "draft",
  href: "/relatorios/perfil",
  menuPath: "Relatórios → Perfil do cliente",
  aliases: [
    "perfil cliente",
    "retorno",
    "recompra",
    "follow-up",
    "perdidos que voltaram",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_gerar", "como_fazer", "objecao"],
  summary:
    "Quem sumiu, recorrência, quem voltou e serviços/produtos a reoferecer — com follow-up Zap/Donna.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Relatórios → Perfil do cliente (/relatorios/perfil). Dono, admin e manager.",
    },
    {
      title: "Abas",
      detail:
        "Retorno, Recorrência, Voltaram esta semana, Serviços, Produtos. Default: Retorno.",
    },
    {
      title: "Ajustar critérios",
      detail:
        "Formulário: Mín. sem vir (dias), Janela máx., Recorrência parada, Ciclo serviço, Recompra produto → Atualizar. Sem presets Esta semana/Este mês.",
    },
    {
      title: "Follow-up",
      detail:
        "Por linha (quando houver telefone): Copiar msg, Enviar Zap, Donna. Sem tel. aparece badge. Atalhos Pedir follow-up à Donna / Abrir Donna → Conversas.",
    },
    {
      title: "Exportar",
      detail:
        "CSV nas abas Retorno, Recorrência e Voltaram. Serviços/Produtos sem CSV nem botões de Zap na tabela.",
    },
  ],
  objections: [
    {
      concern: "Cliente sem botão de Zap",
      reply:
        "Precisa ter telefone no cadastro. Cadastre/atualize em Clientes e atualize o relatório.",
    },
  ],
  relatedGuideIds: ["clientes", "conversas-ia", "alertas"],
  lastVerified: "2026-09-15",
};
