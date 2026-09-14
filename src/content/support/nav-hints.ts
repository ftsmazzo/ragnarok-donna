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
    aliases: ["agenda", "grade", "horário", "agendar", "marcar"],
    title: "Agenda",
    where: "Menu → Agenda",
    tip: "Calendário na sidebar; pensamento rápido no canto direito (desktop).",
  },
  {
    id: "clientes",
    aliases: ["cliente", "clientes", "cadastro cliente", "foto"],
    title: "Clientes",
    where: "Cadastros → Clientes",
  },
  {
    id: "profissionais",
    aliases: ["barbeiro", "profissional", "equipe agenda"],
    title: "Profissionais",
    where: "Cadastros → Profissionais",
  },
  {
    id: "servicos",
    aliases: ["serviço", "serviços", "corte", "barba"],
    title: "Serviços",
    where: "Cadastros → Serviços",
  },
  {
    id: "produtos",
    aliases: ["produto", "produtos", "estoque", "coca"],
    title: "Produtos",
    where: "Cadastros → Produtos",
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
    tip: "Comanda fechada não reabre — abra outra pro mesmo cliente.",
  },
  {
    id: "consumo",
    aliases: ["consumo", "meu consumo", "uso interno", "venda celular"],
    title: "Venda / Consumo",
    where: "Comandas → Venda / Consumo (celular) ou /pwa/consumo",
  },
  {
    id: "caixa",
    aliases: ["caixa", "dinheiro"],
    title: "Caixa",
    where: "Financeiro → Caixa",
  },
  {
    id: "comissoes",
    aliases: ["comissão", "comissões"],
    title: "Comissões",
    where: "Financeiro → Comissões",
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
    where: "Configurações → Lista de espera",
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
