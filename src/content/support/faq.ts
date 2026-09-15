export type SupportFaqEntry = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  /** Caminho aproximado no menu, se houver. */
  menuPath?: string;
};

/** Base inicial — só operar o app (não comercial / não Donna cliente). */
export const SUPPORT_FAQ: SupportFaqEntry[] = [
  {
    id: "agenda-abrir",
    question: "Como abro a agenda?",
    answer:
      "No menu lateral, clique em Agenda. Dá pra trocar o dia no calendário da sidebar e ver a grade por profissional.",
    tags: ["agenda", "grade", "calendário"],
    menuPath: "Agenda",
  },
  {
    id: "agenda-agendar",
    question: "Como marco um horário?",
    answer:
      "Na grade da Agenda, clique no horário vazio do profissional. Preencha cliente, serviço e confirme. No desktop também dá pra usar o widget Pensamento rápido (canto direito) pra ir direto num horário livre.",
    tags: ["agenda", "agendar", "marcar", "horário"],
    menuPath: "Agenda",
  },
  {
    id: "agenda-encaixe",
    question: "Como faço um encaixe agora?",
    answer:
      "Na Agenda, ao criar/editar o agendamento, use a opção de encaixe imediato (agora). Isso é no painel — a Donna no WhatsApp não sobrescreve esse encaixe.",
    tags: ["agenda", "encaixe", "agora", "imediato"],
    menuPath: "Agenda",
  },
  {
    id: "agenda-confirmar",
    question: "O que significa confirmado na agenda?",
    answer:
      "Status confirmado aparece em verde na grade. Serve pra equipe ver quem já confirmou o horário.",
    tags: ["agenda", "confirmado", "verde", "status"],
    menuPath: "Agenda",
  },
  {
    id: "comanda-abrir",
    question: "Como abro uma comanda?",
    answer:
      "Pela Agenda: no horário do cliente, abra a comanda sem sair da tela. Ou em Comandas → Abertas. Depois acrescente serviços/produtos e feche o pagamento.",
    tags: ["comanda", "abrir", "pedido"],
    menuPath: "Comandas → Abertas",
  },
  {
    id: "comanda-fechar",
    question: "Como fecho e pago a comanda?",
    answer:
      "Na comanda aberta (Comandas → Abertas → clique na linha): se ainda há Saldo, use Pagar e fechar e escolha a forma (PIX, PIX chave, Link Rede, Infinity, dinheiro, cartão…). Se o saldo já é zero, use Fechar comanda. Precisa ter ao menos um item. Histórico em Comandas → Histórico.",
    tags: ["comanda", "pagar", "fechar", "pagamento"],
    menuPath: "Comandas → Abertas",
  },
  {
    id: "comanda-reabrir",
    question: "Como reabro uma comanda fechada?",
    answer:
      "Dono/admin: Comandas → Histórico → clique na comanda (ou use Reabrir). A comanda volta a aberta para corrigir/adicionar itens; os pagamentos já lançados permanecem. Ao fechar de novo, cobre só o saldo restante. Se remover itens e o total ficar abaixo do já pago, o sistema bloqueia — ajuste o pagamento manualmente antes. Barbeiro/recepção sem perfil dono não reabre.",
    tags: ["comanda", "reabrir", "fechada", "adicionar", "serviço", "depois", "histórico"],
    menuPath: "Comandas → Histórico",
  },
  {
    id: "consumo-barbeiro",
    question: "Como o barbeiro lança consumo (coca, trufa)?",
    answer:
      "No celular: Venda / Consumo em Comandas (ou /pwa/consumo). Em Meu consumo o valor entra com desconto de 30% na comissão. Produto de venda na comanda do cliente é outro fluxo, na mesma tela.",
    tags: ["consumo", "barbeiro", "produto", "pwa", "30%"],
    menuPath: "Comandas → Venda / Consumo (celular)",
  },
  {
    id: "uso-interno",
    question: "Onde lanço uso interno de produto?",
    answer:
      "Cadastros → Produtos: o produto precisa estar marcado como Uso interno. Na lista, use a ação de baixar estoque (1 un.). Isso não passa por comanda nem comissão de barbeiro. Meu consumo do barbeiro (−30%) é outra coisa: Comandas → Venda / Consumo no celular.",
    tags: ["uso interno", "estoque", "dona", "produto"],
    menuPath: "Cadastros → Produtos",
  },
  {
    id: "foto-cliente",
    question: "Como coloco foto do cliente?",
    answer:
      "No cadastro do cliente (Clientes) ou no drawer do agendamento, use o upload de foto. A foto aparece na agenda.",
    tags: ["foto", "avatar", "cliente", "cadastro"],
    menuPath: "Cadastros → Clientes",
  },
  {
    id: "cliente-conheceu",
    question: "Onde registro por onde o cliente conheceu?",
    answer:
      "No cadastro do cliente: campo por onde conheceu (Indicação, Instagram, Google, Passou na frente, WhatsApp, Outro).",
    tags: ["cliente", "indicação", "origem", "conheceu"],
    menuPath: "Cadastros → Clientes",
  },
  {
    id: "pacote-credito",
    question: "Como abate pacote / crédito na comanda?",
    answer:
      "Na ficha do cliente (aba Pacotes) você vê o saldo. Venda o pacote na comanda; a carteira só libera ao pagar/fechar. Ao lançar serviço ou produto coberto, o abate de 1 crédito (R$ 0) vem marcado por padrão — desmarque só para cobrar avulso. Comissão pela venda do pacote usa o % do cadastro (ou do profissional). Repor/renovar na ficha ou na carteira da comanda.",
    tags: ["pacote", "crédito", "recorrência", "comanda", "renovar", "comissão"],
    menuPath: "Comandas / Cadastros → Clientes (aba Pacotes) / Cadastros → Pacotes",
  },
  {
    id: "caixa",
    question: "Onde vejo o caixa do dia?",
    answer:
      "Financeiro → Caixa. No dia de hoje: Abrir caixa (fundo), ver movimentos, Suprimento/Sangria/Vale e Fechar com a contagem. Pagamentos de comanda entram na sessão quando o caixa está aberto. Dias anteriores são só consulta.",
    tags: ["caixa", "financeiro", "dinheiro", "sangria", "suprimento"],
    menuPath: "Financeiro → Caixa",
  },
  {
    id: "comissoes",
    question: "Onde vejo comissões?",
    answer:
      "Financeiro → Comissões. Barbeiro vê só as próprias; dono/admin vê todos, filtra período e exporta CSV. Lá (ou no Caixa) lança vale, bônus, desconto ou pagamento. Consumo com −30% e crédito de pacote (comissão na tabela) entram nesse cálculo.",
    tags: ["comissão", "comissões", "financeiro", "vale"],
    menuPath: "Financeiro → Comissões",
  },
  {
    id: "conversas-donna",
    question: "Onde ficam as conversas da Donna no WhatsApp?",
    answer:
      "No painel: Conversas IA. No celular: App celular (PWA) → conversas. Isso é atendimento ao cliente final — não é este chat de suporte do app.",
    tags: ["donna", "whatsapp", "conversas", "ia"],
    menuPath: "Conversas IA / Configurações → App celular",
  },
  {
    id: "lista-espera",
    question: "Onde fica a lista de espera?",
    answer:
      "Configurações → Lista de espera (também há atalho na Agenda). É a fila da Donna no WhatsApp: a loja consulta quem aguarda ou já foi notificado. Entrada na fila e aviso de vaga são da Donna — para marcar na hora, use a Agenda.",
    tags: ["espera", "lista", "waitlist"],
    menuPath: "Configurações → Lista de espera",
  },
  {
    id: "equipe-acesso",
    question: "Como libero acesso pra recepção ou barbeiro?",
    answer:
      "Configurações → Equipe de acesso. Cadastre o e-mail, escolha o papel e vincule o profissional se for barbeiro.",
    tags: ["equipe", "acesso", "login", "permissão"],
    menuPath: "Configurações → Equipe de acesso",
  },
  {
    id: "agente-donna-config",
    question: "Onde configuro a Donna?",
    answer:
      "Configurações → Agente (Donna). No topo: WhatsApp da unidade (vincular instância existente, gerar QR, ver se está conectado, trocar foto/nome). Abaixo: persona, tom e alerta humano. Este suporte do painel é outro agente — não misture.",
    tags: ["agente", "donna", "configuração", "persona", "whatsapp", "qr", "instância"],
    menuPath: "Configurações → Agente (Donna)",
  },
  {
    id: "bloqueio-agenda",
    question: "Como bloqueio um horário na agenda?",
    answer:
      "Na Agenda, no slot desejado, use bloqueio e informe o motivo. Fica registrado quem bloqueou.",
    tags: ["bloqueio", "agenda", "motivo"],
    menuPath: "Agenda",
  },
  {
    id: "alerta-comanda",
    question: "Por que aparece alerta de comanda aberta?",
    answer:
      "Comanda aberta há mais de 1 hora gera alerta pra equipe não esquecer de fechar. Veja também Relatórios → Alertas.",
    tags: ["alerta", "comanda", "1h"],
    menuPath: "Relatórios → Alertas",
  },
  {
    id: "receita-zerada",
    question: "Por que o relatório financeiro / painel está sem receita?",
    answer:
      "A receita conta pagamentos de comandas fechadas no Caixa. Comanda só aberta no balcão não entra. Feche a comanda (Pagar e fechar) e filtre o período de novo em Relatórios.",
    tags: ["receita", "financeiro", "faturamento", "caixa", "relatório"],
    menuPath: "Relatórios → Financeiro",
  },
  {
    id: "fluxo-vs-caixa",
    question: "Qual a diferença entre Caixa e Fluxo de caixa?",
    answer:
      "Caixa (/caixa) é a sessão do dia: abrir, sangria, fechar. Fluxo (/relatorios/fluxo) é o relatório do período (disponível aprox., crédito, vales). Os dois se alimentam dos mesmos pagamentos.",
    tags: ["fluxo", "caixa", "financeiro"],
    menuPath: "Financeiro → Fluxo de caixa",
  },

  {
    id: "fora-escopo",
    question: "Posso perguntar preço do plano ou agendar cliente por aqui?",
    answer:
      "Não. Este chat só tira dúvida de como usar o app. Preço comercial e agenda do cliente no Zap são outros canais — peça humano se for problema operacional, ou use a Donna no WhatsApp pro cliente.",
    tags: ["escopo", "plano", "preço", "fora"],
  },
];
