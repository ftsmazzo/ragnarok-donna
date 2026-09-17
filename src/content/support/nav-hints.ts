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
    aliases: ["conversas", "whatsapp", "donna zap", "inbox", "assumir"],
    title: "Conversas IA (Donna)",
    where: "Conversas IA",
    tip: "WhatsApp do cliente — Assumir/Devolver à IA. Não é o FAB Suporte do app.",
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
    aliases: ["equipe", "acesso", "login", "senha", "permissão", "criar acesso"],
    title: "Equipe de acesso",
    where: "Configurações → Equipe de acesso",
    tip: "Barbeiro: Criar acesso no bloco sem login + vincular profissional na tabela.",
  },
  {
    id: "empresa",
    aliases: ["empresa", "dados da empresa", "nome fantasia"],
    title: "Dados da empresa",
    where: "Configurações → Dados da empresa",
    tip: "Cadastro que a Donna usa. WhatsApp conecta em Agente/Conversas.",
  },
  {
    id: "conta",
    aliases: ["minha conta", "senha", "trocar senha"],
    title: "Minha conta",
    where: "Configurações → Minha conta (atalho Conta na topbar)",
    tip: "Só troca a própria senha. E-mail não edita aqui.",
  },
  {
    id: "agente",
    aliases: ["agente", "configurar donna", "persona", "qr"],
    title: "Agente (Donna)",
    where: "Configurações → Agente (Donna)",
    tip: "WhatsApp da unidade + persona/tom. Salvar configuração. Só dono/admin.",
  },
  {
    id: "disparos",
    aliases: ["disparo", "disparos", "confirmação", "blast", "campanha"],
    title: "Disparos WhatsApp",
    where: "Configurações → Disparos WhatsApp",
    tip: "Regras automáticas (não blast manual). Toggle pode não enviar se o servidor estiver bloqueado.",
  },
  {
    id: "pwa",
    aliases: ["pwa", "app celular", "instalar"],
    title: "App celular (PWA)",
    where: "Configurações → App celular (PWA)",
    tip: "Conversas no celular. Barbeiro: Comandas → Venda / Consumo.",
  },
  {
    id: "alertas",
    aliases: ["alerta", "alertas", "crítico"],
    title: "Alertas",
    where: "Relatórios → Alertas",
    tip: "Semana atual (SP). Abrir pode ir a telas só dono/admin (ex. estoque).",
  },
  {
    id: "relatorios",
    aliases: ["relatório", "relatorios", "painel gerencial", "visão geral"],
    title: "Visão geral",
    where: "Relatórios → Visão geral",
    tip: "Receita = pagamentos de comandas fechadas no Caixa. Só dono/admin.",
  },
  {
    id: "fluxo",
    aliases: ["fluxo", "fluxo de caixa"],
    title: "Fluxo de caixa",
    where: "Financeiro → Fluxo de caixa",
    tip: "Relatório do período; Caixa do dia é a sessão de hoje (abrir/fechar).",
  },
  {
    id: "contas",
    aliases: ["contas", "contas a pagar", "vales abertos"],
    title: "Contas",
    where: "Financeiro → Contas",
    tip: "A receber = só fiado (Conta Cliente). Comanda aberta e cartão crédito são informativos — pacote valor 0 não é dívida.",
  },
];
