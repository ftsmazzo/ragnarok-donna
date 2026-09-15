import type { SupportGuide } from "./types";

/** S3 — enriquecido a partir de AgendaView, Detail/Form/ContextMenu, QuickThink, lista-espera. */
export const guideAgenda: SupportGuide = {
  id: "agenda",
  title: "Agenda",
  status: "ready",
  href: "/agenda",
  menuPath: "Agenda",
  aliases: [
    "agenda",
    "grade",
    "horário",
    "agendar",
    "marcar",
    "encaixe",
    "calendário",
    "bloquear horário",
    "bloqueio",
    "confirmar",
    "desconfirmar",
    "pensamento rápido",
    "remarcar",
    "ausente",
    "cancelado",
    "no-show",
    "realizado",
  ],
  roles: ["owner", "admin", "reception", "staff", "readonly"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary:
    "Grade por profissional: marcar, remarcar, encaixe, bloqueio, confirmar e abrir comanda do horário.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Agenda (/agenda). Grade do dia por profissional; calendário na sidebar para trocar a data. No mobile/tablet há modo Agenda otimizado.",
    },
    {
      title: "Marcar horário (slot vazio)",
      detail:
        "Clique num horário vazio da coluna do profissional. Preencha cliente, serviço, duração e confirme. O cliente precisa existir no cadastro (ou criar na hora pelo seletor).",
    },
    {
      title: "Pensamento rápido (desktop)",
      detail:
        "No canto da tela, o widget Pensamento rápido lista horários livres do dia por profissional. Clique no horário para ir direto ao agendamento.",
    },
    {
      title: "Ver / editar um horário",
      detail:
        "Clique no card do agendamento para abrir Agendamento (detalhe). Clique com o botão direito (desktop) abre o menu rápido (comanda, No Local, Ausente, Confirmar…).",
    },
    {
      title: "Remarcar (Editar agendamento)",
      detail:
        "No detalhe, botão Editar → modal Editar agendamento: mude data/hora, cliente, serviço, profissional ou observação e salve. Só quem tem permissão de escrita na agenda vê Editar (Somente leitura não altera).",
    },
    {
      title: "No Local e fluxo do atendimento",
      detail:
        "No detalhe ou menu de contexto: No Local (status chegou — na grade aparece · no local). Depois Em atendimento e Finalizar horário (vira Realizado no status e nos relatórios). Barbeiro vinculado pode marcar status nos próprios horários; cancelar/ausente exige gerente/dono.",
    },
    {
      title: "Check-in pelo WhatsApp",
      detail:
        "Se o cliente manda que está na barbearia e já tem horário hoje, a Donna faz check-in automático (equivalente a chegada). A recepção confere na grade o · no local ou o status no detalhe.",
    },
    {
      title: "Ausente e Cancelado",
      detail:
        "No detalhe (botões Ausente e Cancelado) ou menu de contexto — só com permissão de cancelamento (dono, admin, gerente). Ausente = no-show (cliente faltou). Cancelado = desistência antes ou no dia. Horários encerrados somem das ações rápidas.",
    },
    {
      title: "Quem pode cancelar / marcar status",
      detail:
        "Gerente e dono/admin: escrevem na agenda, cancelam (Ausente/Cancelado) e mudam qualquer horário. Barbeiro: vê só a própria coluna (profissional vinculado), marca No Local / Em atendimento / Finalizar horário nos seus — não vê Ausente/Cancelado. Somente leitura: consulta a grade, sem botões de alteração.",
    },
    {
      title: "Confirmar / desconfirmar",
      detail:
        "Status confirmado aparece em verde na grade — a equipe vê quem já confirmou. No detalhe ou menu de contexto: Confirmar ou Desconfirmar.",
    },
    {
      title: "Encaixe (agora / fora da grade normal)",
      detail:
        "No detalhe do horário ou no menu: Encaixe. Ao criar, também há modo Encaixe no formulário. Marca o horário como encaixe na grade. Isso é operação do painel — a Donna no WhatsApp não sobrescreve esse encaixe.",
    },
    {
      title: "Bloquear horário",
      detail:
        "No slot desejado, use o fluxo de bloqueio e informe o motivo. Fica registrado quem bloqueou. Impede marcar cliente naquele intervalo.",
    },
    {
      title: "Abrir comanda pelo horário",
      detail:
        "No detalhe do agendamento: Abrir comanda (ou Ver comanda se já existir). Também no menu de contexto. A comanda vincula cliente e pode sugerir o profissional do horário.",
    },
    {
      title: "Atalho lista de espera",
      detail:
        "Na lateral da Agenda há atalho para Lista de espera (com contador). A lista em si é alimentada pela Donna — ver guia Lista de espera.",
    },
  ],
  objections: [
    {
      concern: "Não acho horário livre",
      reply:
        "Troque o dia no calendário da sidebar. No desktop use Pensamento rápido para ver todos os buracos do dia. Confira se o profissional tem jornada naquele dia (Cadastros → Profissionais).",
    },
    {
      concern: "Cliente quer encaixe agora e a Donna não marca",
      reply:
        "Encaixe imediato é no painel (Agenda → encaixe). A Donna no Zap oferece alternativas e espera — não força encaixe por cima da operação da loja.",
    },
    {
      concern: "Quero só bloquear almoço / reunião",
      reply:
        "Na Agenda, no slot, use bloqueio com o motivo. Não misture com agendamento de cliente.",
    },
    {
      concern: "Como abro a comanda sem sair da agenda?",
      reply:
        "Clique no horário → Abrir comanda. Em muitos casos o drawer abre sem ir para Comandas → Abertas.",
    },
    {
      concern: "Foto do cliente na agenda",
      reply:
        "Cadastre a foto em Clientes (ou no drawer do agendamento, se disponível). Ela aparece no card da grade.",
    },
    {
      concern: "Já abri comanda e quero cancelar o horário",
      reply:
        "Ausente/Cancelado no agendamento libera o slot (e pode avisar lista de espera), mas não fecha a comanda sozinho. Vá em Comandas → Abertas, ajuste ou feche a comanda à parte.",
    },
    {
      concern: "Barbeiro só vê os horários dele?",
      reply:
        "Sim: com Profissional vinculado em Equipe de acesso, a grade filtra só a coluna desse profissional. Sem vínculo, o Início avisa para o dono configurar.",
    },
    {
      concern: "Cliquei Ausente/Cancelado e o status não mudou",
      reply:
        "Barbeiro não tem botões Ausente/Cancelado — peça à recepção. Se deu erro na tela, recarregue a Agenda. Horário já Realizado/Cancelado/Ausente não aceita a mesma ação de novo.",
    },
    {
      concern: "Diferença entre Ausente e Cancelado",
      reply:
        "Cancelado = desmarcou ou a loja cancelou antes de contar falta. Ausente = faltou (no-show), útil para relatório Agendamentos e métricas de ausência. Os dois liberam o horário na grade.",
    },
  ],
  relatedGuideIds: ["lista-espera", "clientes", "comandas", "servicos", "profissionais"],
  lastVerified: "2026-09-15",
};

export const guideListaEspera: SupportGuide = {
  id: "lista-espera",
  title: "Lista de espera",
  status: "ready",
  href: "/lista-espera",
  menuPath: "Configurações → Lista de espera",
  aliases: [
    "lista de espera",
    "espera",
    "waitlist",
    "fila",
    "aguardando",
    "notificados",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary:
    "Fila gerida pela Donna no WhatsApp: a loja consulta quem aguarda e quem já foi avisado.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Configurações → Lista de espera (/lista-espera). Também há atalho na Agenda (lateral), com contador de quem aguarda.",
    },
    {
      title: "O que a tela mostra",
      detail:
        "Filtros: Aguardando · Notificados · Todos. Colunas: telefone, cliente, serviço, profissional, data desejada, status, observação. Cards no topo: quantos aguardam e quantos já foram notificados.",
    },
    {
      title: "Como a pessoa entra na fila",
      detail:
        "Só pela Donna no WhatsApp (sem intervenção humana no Zap): se o horário pedido está ocupado, ela oferece 2–3 alternativas; se o cliente recusar, entra na espera. Quando alguém cancela, a Donna avisa o primeiro da fila.",
    },
    {
      title: "Papel da recepção",
      detail:
        "Consultar e acompanhar. Não é uma fila para a loja “arrastar e marcar” nesta tela — o fluxo de oferta/aviso é da Donna. Para marcar na hora, use a Agenda normalmente.",
    },
  ],
  objections: [
    {
      concern: "Não consigo adicionar alguém na lista de espera pelo painel",
      reply:
        "Esta lista é da Donna. A recepção acompanha em Configurações → Lista de espera (ou atalho na Agenda). Para encaixar cliente na hora, marque direto na Agenda.",
    },
    {
      concern: "Cliente disse que está na espera e não vejo",
      reply:
        "Confira o filtro (Aguardando vs Notificados vs Todos) e o telefone. Se conversou no Zap, a Donna deve ter registrado — veja também Conversas IA.",
    },
    {
      concern: "Diferença entre Aguardando e Notificados",
      reply:
        "Aguardando = ainda na fila. Notificados = a Donna já avisou que abriu vaga (seguir o status na tabela).",
    },
  ],
  relatedGuideIds: ["agenda", "conversas-ia", "agente-donna"],
  lastVerified: "2026-09-15",
  enrichNotes: ["Lista é read-only no painel — reforçar sempre"],
};
