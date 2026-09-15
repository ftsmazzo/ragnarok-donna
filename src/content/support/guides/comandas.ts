import type { SupportGuide } from "./types";

/** S1 — enriquecido a partir da UI real (OrderDrawer, ComandasView, permissões). */
export const guideComandas: SupportGuide = {
  id: "comandas",
  title: "Comandas (abrir, itens, pagar, fechar)",
  status: "draft",
  href: "/comandas",
  menuPath: "Comandas → Abertas",
  aliases: [
    "comanda",
    "comandas",
    "abrir comanda",
    "fechar comanda",
    "pagar",
    "pagamento",
    "pix",
    "pix chave",
    "cartão",
    "débito",
    "crédito",
    "link rede",
    "infinity",
    "dinheiro",
    "desconto",
    "saldo",
    "adicionar serviço",
    "adicionar produto",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "Hub financeiro do atendimento: abrir comanda, lançar serviços/produtos/pacotes, receber e fechar.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Comandas → Abertas (/comandas). Lista as comandas abertas da unidade. Histórico fechado fica em Comandas → Histórico.",
    },
    {
      title: "Abrir comanda pela tela Abertas",
      detail:
        "Em Comandas → Abertas, use Nova comanda. Escolha o cliente (recomendado) e, se quiser, observação. Confirme Abrir comanda — abre o drawer da comanda.",
    },
    {
      title: "Abrir comanda pela Agenda",
      detail:
        "Na Agenda, no horário do cliente, abra a comanda vinculada ao agendamento (não precisa sair da grade). O profissional do horário pode já vir sugerido nos itens.",
    },
    {
      title: "Lançar serviço",
      detail:
        "No drawer: Tipo = Serviço → escolha o serviço → profissional (obrigatório) → quantidade → Adicionar item. Dá para aplicar desconto no item (R$), salvo se estiver abatendo crédito de pacote.",
    },
    {
      title: "Lançar produto",
      detail:
        "Tipo = Produto → escolha o produto → qtd → Adicionar. Baixa estoque. Barbeiro no painel só pode lançar produtos (não serviço/pacote) na comanda.",
    },
    {
      title: "Vender pacote (gerar carteira)",
      detail:
        "Tipo = Vender pacote → escolha o pacote → Vender pacote / gerar carteira. O valor entra na comanda. Os créditos só liberam quando a comanda for paga/fechada (badge “libera ao fechar”). Detalhes no guia Pacotes.",
    },
    {
      title: "Usar crédito de pacote",
      detail:
        "Se o cliente tem crédito para aquele serviço/produto, o abate (1 crédito — R$ 0) vem marcado por padrão. Desmarque só se for cobrar avulso. Comissão do serviço continua no preço de tabela.",
    },
    {
      title: "Desconto da comanda",
      detail:
        "No rodapé do drawer, Desconto da comanda (R$) → Aplicar. Isso reduz o total antes do pagamento.",
    },
    {
      title: "Pagar (parcial ou total)",
      detail:
        "Botão Pagamento: escolha forma (PIX, PIX chave, Link Rede, Infinity, Dinheiro, Débito, Crédito, Transferência, Outro) e o valor. Pode pagar em partes; o Saldo mostra o que falta.",
    },
    {
      title: "Pagar e fechar / Fechar",
      detail:
        "Se ainda há saldo: Pagar e fechar → escolha a forma → Confirmar e fechar (quita o restante e fecha). Se saldo já é zero: Fechar comanda. Precisa ter ao menos 1 item. Comanda fechada vai para o Histórico.",
    },
    {
      title: "Cancelar comanda aberta",
      detail:
        "Só comanda aberta sem pagamentos. Se já houve pagamento, não cancela — remova pagamentos ou feche. Se havia venda de pacote com carteira já liberada e crédito usado, o cancelamento é bloqueado.",
    },
  ],
  objections: [
    {
      concern: "Não acho onde fechar a comanda",
      reply:
        "Abra a comanda na lista (Comandas → Abertas). No rodapé do drawer: se ainda deve, use Pagar e fechar; se já pagou tudo, Fechar comanda.",
    },
    {
      concern: "Não deixa fechar — diz que falta pagar",
      reply:
        "Olhe o Saldo no topo do drawer. Tem que zerar (pagamento parcial até cobrir, ou Pagar e fechar de uma vez). Sem itens também não fecha.",
    },
    {
      concern: "Barbeiro não consegue lançar corte na comanda",
      reply:
        "No painel, barbeiro só lança produto na comanda. Serviço e pacote são recepção/dono. Consumo do barbeiro (coca etc.) é em Comandas → Venda / Consumo no celular.",
    },
    {
      concern: "Vendi pacote e o crédito não aparece",
      reply:
        "Crédito só libera ao pagar/fechar a comanda. Enquanto estiver aberta, o item mostra “libera ao fechar”. Depois do fechamento, veja a carteira no drawer ou na ficha do cliente → aba Pacotes.",
    },
    {
      concern: "Cliente sem nome na comanda e não vende pacote",
      reply:
        "Vincule o cliente ao abrir (ou abra pela Agenda com cliente). Sem cliente não dá para vender/usar pacote.",
    },
    {
      concern: "Removi o item e deu erro de pacote",
      reply:
        "Se a carteira já tinha sido usada (crédito abatido), não dá para remover a venda do pacote. Se ainda não usou, a remoção cancela a carteira.",
    },
  ],
  relatedGuideIds: ["comandas-historico", "pacotes", "consumo-pwa", "caixa", "comissoes"],
  lastVerified: "2026-09-15",
  enrichNotes: [
    "Validar com recepção na loja → promover status para ready",
    "Permissão reabrir: só owner/admin (isOwnerRole)",
  ],
};

export const guideComandasHistorico: SupportGuide = {
  id: "comandas-historico",
  title: "Histórico e reabrir comanda",
  status: "draft",
  href: "/comandas/historico",
  menuPath: "Comandas → Histórico",
  aliases: [
    "histórico",
    "comanda fechada",
    "reabrir",
    "reabrir comanda",
    "comanda cancelada",
    "histórico comandas",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "Consultar comandas fechadas/canceladas; dono/admin pode reabrir para corrigir itens.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Comandas → Histórico (/comandas/historico). Lista comandas já fechadas ou canceladas.",
    },
    {
      title: "Consultar uma comanda",
      detail:
        "Clique na linha para abrir o drawer (mesma visão: itens, pagamentos, totais). Dá para conferir o que foi cobrado e como foi pago.",
    },
    {
      title: "Reabrir (só dono/admin)",
      detail:
        "Com a comanda fechada aberta no drawer, use Reabrir comanda — ou o botão Reabrir na tabela do histórico. A comanda volta para Abertas. Pagamentos já lançados permanecem.",
    },
    {
      title: "Depois de reabrir",
      detail:
        "Pode adicionar/remover itens e ajustar. Ao fechar de novo, cobre só o saldo restante. Se remover itens e o total ficar abaixo do já pago, o sistema bloqueia — ajuste o pagamento antes.",
    },
    {
      title: "Quem não reabre",
      detail:
        "Recepção e barbeiro sem perfil dono/admin não veem Reabrir. Nesse caso peçam ao dono ou abram outra comanda para o mesmo cliente (sem desfazer a anterior).",
    },
  ],
  objections: [
    {
      concern: "Comanda fechada não reabre mais?",
      reply:
        "Reabre sim — dono/admin em Comandas → Histórico → abrir a comanda → Reabrir. O tip antigo “não reabre” está desatualizado.",
    },
    {
      concern: "Não aparece o botão Reabrir",
      reply:
        "Só dono/admin. Confira se a comanda está fechada (não cancelada) e se o login tem esse perfil.",
    },
    {
      concern: "Reabri e o valor ficou estranho",
      reply:
        "O que já foi pago continua. O Saldo é o que falta. Se tirou itens demais, o total não pode ficar menor que o pago — corrija itens ou peça ajuste de pagamento ao dono.",
    },
    {
      concern: "Preciso só acrescentar um serviço esquecido",
      reply:
        "Dono reabre a comanda do histórico, lança o serviço, e usa Pagar e fechar só no saldo novo. Alternativa: nova comanda só com o item esquecido (dois recibos).",
    },
  ],
  relatedGuideIds: ["comandas", "comissoes", "caixa"],
  lastVerified: "2026-09-15",
  enrichNotes: ["Promover para ready após validação na recepção"],
};

/** S2 — ainda esqueleto */
export const guideConsumoPwa: SupportGuide = {
  id: "consumo-pwa",
  title: "Venda / Consumo no celular",
  status: "skeleton",
  href: "/pwa/consumo",
  menuPath: "Comandas → Venda / Consumo (celular)",
  aliases: ["consumo", "meu consumo", "uso interno", "pwa consumo", "coca", "trufa"],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary: "Lançar venda rápida, consumo do barbeiro (−30%) e uso interno.",
  steps: [],
  objections: [],
  relatedGuideIds: ["comandas", "produtos", "comissoes"],
  lastVerified: null,
  enrichNotes: ["Meu consumo vs venda cliente vs uso interno (dona)"],
};
