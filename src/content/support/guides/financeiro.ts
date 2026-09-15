import type { SupportGuide } from "./types";

export const guideCaixa: SupportGuide = {
  id: "caixa",
  title: "Caixa do dia",
  status: "draft",
  href: "/caixa",
  menuPath: "Financeiro → Caixa",
  aliases: [
    "caixa",
    "abrir caixa",
    "fechar caixa",
    "sangria",
    "suprimento",
    "dinheiro do dia",
    "vale",
    "fundo de caixa",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer", "como_gerar", "objecao"],
  summary:
    "Sessão de caixa do dia: abrir com fundo, ver movimentos (pagamentos + sangria/suprimento), vale e fechar com contagem.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Financeiro → Caixa (/caixa). Navegue entre dias (Hoje / Anterior / Próximo). Escrita (abrir, sangria, fechar) só no dia de hoje.",
    },
    {
      title: "Abrir caixa",
      detail:
        "No dia de hoje, se não houver sessão aberta: Abrir caixa → informe o fundo (abertura) e, se quiser, observação. Pagamentos de comandas passam a entrar na sessão aberta.",
    },
    {
      title: "O que aparece na tela",
      detail:
        "Banner com status (aberto/fechado), fundo e saldo esperado. Cards/resumo do dia e lista de movimentos (entradas de pagamento vinculadas a comanda, suprimentos e sangrias).",
    },
    {
      title: "Suprimento e sangria",
      detail:
        "Com caixa aberto: Suprimento = entrada de dinheiro no caixa (fora de comanda). Sangria = retirada. Informe valor, forma (se pedido) e descrição.",
    },
    {
      title: "Vale pelo caixa",
      detail:
        "Com caixa aberto e profissionais cadastrados: botão Vale abre o lançamento de vale/ajuste para o barbeiro (mesmo fluxo de comissões). Também dá para lançar em Financeiro → Comissões.",
    },
    {
      title: "Fechar caixa",
      detail:
        "Fechar caixa → informe a contagem (valor físico) e observação. A sessão do dia fica fechada. Dias passados são consulta.",
    },
    {
      title: "Sem caixa aberto",
      detail:
        "Pagamentos de comandas continuam sendo registrados no sistema; com o caixa aberto eles entram na sessão do dia (comportamento alinhado ao Barber).",
    },
  ],
  objections: [
    {
      concern: "Não consigo abrir/fechar o caixa de ontem",
      reply:
        "Abrir, sangria, suprimento e fechar só no dia de hoje. Dias anteriores são para consultar o que já rolou.",
    },
    {
      concern: "Paguei comanda e não vejo no caixa",
      reply:
        "Confira se há sessão aberta hoje e se está no dia certo (filtro Hoje). Sem sessão aberta o pagamento existe na comanda, mas não entra na lista da sessão.",
    },
    {
      concern: "Diferença entre sangria e vale",
      reply:
        "Sangria = dinheiro saindo do caixa (loja). Vale = adiantamento/desconto na conta do profissional (comissão). Vale pode ser lançado no Caixa ou em Comissões.",
    },
  ],
  relatedGuideIds: ["comandas", "comissoes", "fluxo-caixa", "contas"],
  lastVerified: "2026-09-15",
  enrichNotes: ["Promover para ready após validação na loja"],
};

export const guideComissoes: SupportGuide = {
  id: "comissoes",
  title: "Comissões",
  status: "draft",
  href: "/comissoes",
  menuPath: "Financeiro → Comissões",
  aliases: [
    "comissão",
    "comissões",
    "repasse",
    "pagamento barbeiro",
    "vale",
    "bônus",
    "a pagar",
    "minhas comissões",
  ],
  roles: ["owner", "admin", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "Comissão por itens de comanda no período; vales/bônus/descontos/pagamentos; barbeiro vê só as próprias.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Financeiro → Comissões (/comissoes). Dono/admin vê todos; barbeiro vê “Minhas comissões” (só o próprio profissional vinculado).",
    },
    {
      title: "Filtrar o período",
      detail:
        "Use de/até, profissional (dono/admin) e tipo de item. A página mostra totais, ranking, mix por tipo e lista detalhada. Dá para exportar CSV.",
    },
    {
      title: "De onde vem a comissão",
      detail:
        "Itens de comanda com profissional e %: serviço e produto (cadastro ou padrão do profissional); venda de pacote usa a comissão % do pacote; serviço/produto pago com crédito de pacote comissiona no preço de tabela (item R$ 0).",
    },
    {
      title: "Consumo do barbeiro (−30%)",
      detail:
        "Meu consumo no celular gera desconto na conta do profissional (preço × 70%). Aparece nos ajustes/descontos do período — ver guia Consumo PWA.",
    },
    {
      title: "Lançar vale, bônus, desconto ou pagamento",
      detail:
        "Dono/admin: botão Lançar vale / ajuste → profissional, tipo (vale, bônus, desconto na comissão, pagamento de comissão), valor e data. Também há atalho Vale no Caixa.",
    },
    {
      title: "A pagar",
      detail:
        "Resumo por profissional: comissão − vales/descontos + bônus − já pago = a pagar. Use o tipo Pagamento de comissão para registrar o repasse.",
    },
  ],
  objections: [
    {
      concern: "Barbeiro não vê os colegas",
      reply:
        "Normal: perfil staff só enxerga as próprias comissões. Dono/admin vê a equipe toda e filtra por profissional.",
    },
    {
      concern: "Comissão do pacote / crédito zerado",
      reply:
        "Venda do pacote: % do cadastro do pacote. Uso de crédito: item sai R$ 0, mas a comissão do serviço usa o preço de tabela. Confira se o item tem profissional na comanda.",
    },
    {
      concern: "Não acho o consumo de coca na comissão",
      reply:
        "Consumo (−30%) entra como ajuste/desconto do profissional, não como item de serviço. Filtre o período em que foi lançado e olhe vales/descontos.",
    },
    {
      concern: "Como marco que já paguei o barbeiro?",
      reply:
        "Em Comissões → Lançar vale / ajuste → tipo Pagamento de comissão, com o valor repassado. Isso reduz o “a pagar”.",
    },
  ],
  relatedGuideIds: ["comandas", "pacotes", "consumo-pwa", "profissionais", "caixa"],
  lastVerified: "2026-09-15",
  enrichNotes: ["Promover para ready após validação na loja"],
};


export const guideFluxoCaixa: SupportGuide = {
  id: "fluxo-caixa",
  title: "Fluxo de caixa",
  status: "skeleton",
  href: "/relatorios/fluxo",
  menuPath: "Financeiro → Fluxo de caixa",
  aliases: ["fluxo", "fluxo de caixa", "entrada saída"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_gerar"],
  summary: "Visão de entradas e saídas no tempo.",
  steps: [],
  objections: [],
  relatedGuideIds: ["caixa", "relatorio-financeiro", "contas"],
  lastVerified: null,
};

export const guideContas: SupportGuide = {
  id: "contas",
  title: "Contas a pagar / receber",
  status: "skeleton",
  href: "/contas",
  menuPath: "Financeiro → Contas",
  aliases: ["contas", "contas a pagar", "contas a receber", "boleto"],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer"],
  summary: "Lançamentos de contas da unidade.",
  steps: [],
  objections: [],
  relatedGuideIds: ["caixa", "fluxo-caixa"],
  lastVerified: null,
};
