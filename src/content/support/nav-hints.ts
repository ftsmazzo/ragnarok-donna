export type FeatureHint = {
  id: string;
  aliases: string[];
  title: string;
  where: string;
  tip?: string;
};

/** Mapa “onde fica X” — espelha o menu do painel. */
export const FEATURE_HINTS: FeatureHint[] = [
  {
    id: "agenda",
    aliases: ["agenda", "grade", "horário", "agendar", "marcar", "encaixe", "bloqueio"],
    title: "Agenda",
    where: "Menu → Agenda",
    tip: "Slot vazio para marcar; Pensamento rápido (desktop) lista buracos do dia. Encaixe/bloqueio/comanda no detalhe ou menu do horário.",
  },
  {
    id: "clientes",
    aliases: ["cliente", "clientes", "cadastro cliente", "foto", "indicação"],
    title: "Clientes",
    where: "Cadastros → Clientes",
    tip: "Ficha com abas (Pacotes, Agenda, Comandas). Foto e “por onde conheceu” no cadastro.",
  },
  {
    id: "profissionais",
    aliases: ["barbeiro", "profissional", "equipe agenda", "jornada"],
    title: "Profissionais",
    where: "Cadastros → Profissionais",
    tip: "Jornada por dia define a grade. Login do barbeiro vincula em Equipe de acesso.",
  },
  {
    id: "servicos",
    aliases: ["serviço", "serviços", "corte", "barba"],
    title: "Serviços",
    where: "Cadastros → Serviços",
    tip: "Preço, duração, comissão % e agendável online.",
  },
  {
    id: "produtos",
    aliases: ["produto", "produtos", "estoque", "coca", "uso interno"],
    title: "Produtos",
    where: "Cadastros → Produtos",
    tip: "Para venda na comanda/PWA; Uso interno baixa estoque na própria lista.",
  },
  {
    id: "pacotes",
    aliases: ["pacote", "pacotes", "crédito"],
    title: "Pacotes",
    where: "Cadastros → Pacotes",
  },
  {
    id: "comandas",
    aliases: ["comanda", "comandas", "fechar", "pagar", "reabrir", "fechada"],
    title: "Comandas",
    where: "Comandas → Abertas (histórico em Comandas → Histórico)",
    tip: "Para fechar: abra a comanda → Pagar e fechar (ou Fechar se saldo zero). Dono/admin reabre em Histórico.",
  },
  {
    id: "consumo",
    aliases: ["consumo", "meu consumo", "uso interno", "venda celular"],
    title: "Venda / Consumo",
    where: "Comandas → Venda / Consumo (celular) ou /pwa/consumo",
    tip: "Aba Venda = produto na comanda; Meu consumo = −30% na comissão. Uso interno da loja: Cadastros → Produtos.",
  },
  {
    id: "caixa",
    aliases: ["caixa", "dinheiro", "sangria", "suprimento"],
    title: "Caixa",
    where: "Financeiro → Caixa",
    tip: "Abrir com fundo → pagamentos entram na sessão; Suprimento/Sangria/Vale; Fechar com contagem. Só escreve no dia de hoje.",
  },
  {
    id: "comissoes",
    aliases: ["comissão", "comissões", "vale", "repasse"],
    title: "Comissões",
    where: "Financeiro → Comissões",
    tip: "Barbeiro vê só as próprias. Dono lança vale/bônus/pagamento. Crédito de pacote comissiona no preço de tabela.",
  },
  {
    id: "conversas",
    aliases: ["conversas", "whatsapp", "donna zap", "inbox"],
    title: "Conversas IA (Donna)",
    where: "Conversas IA no painel, ou PWA → conversas no celular",
    tip: "É o WhatsApp do cliente — não é este suporte.",
  },
  {
    id: "espera",
    aliases: ["lista de espera", "espera", "waitlist"],
    title: "Lista de espera",
    where: "Configurações → Lista de espera (atalho na Agenda)",
    tip: "Fila da Donna no WhatsApp — o painel só consulta quem aguarda/foi notificado.",
  },
  {
    id: "equipe",
    aliases: ["equipe", "acesso", "login", "senha", "permissão"],
    title: "Equipe de acesso",
    where: "Configurações → Equipe de acesso",
  },
  {
    id: "agente",
    aliases: ["agente", "configurar donna", "persona"],
    title: "Agente (Donna)",
    where: "Configurações → Agente (Donna)",
  },
  {
    id: "alertas",
    aliases: ["alerta", "alertas"],
    title: "Alertas",
    where: "Relatórios → Alertas",
  },
];
