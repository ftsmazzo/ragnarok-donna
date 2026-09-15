import type { SupportGuide } from "./types";

/** S1 — enriquecido a partir da UI real (OrderDrawer, ComandasView, permissões). */
export const guideComandas: SupportGuide = {
  id: "comandas",
  title: "Comandas (abrir, itens, pagar, fechar)",
  status: "ready",
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
        "No drawer: Tipo = Serviço → escolha o serviço → profissional (obrigatório) → quantidade → Adicionar item. Dá para aplicar desconto no item em % (o R$ é calculado automaticamente). Com crédito de pacote marcado, a % aplica no residual após a cobertura.",
    },
    {
      title: "Lançar produto",
      detail:
        "Tipo = Produto → escolha o produto → qtd → Adicionar. Só entram produtos ativos marcados para venda. Baixa estoque. Barbeiro no painel só pode lançar produtos (não serviço/pacote) na comanda.",
    },
    {
      title: "Vender pacote (gerar carteira)",
      detail:
        "Tipo = Vender pacote → pacote → Vender pacote / gerar carteira (comanda com cliente). Atalho denso: Cadastros → Pacotes → Vender pacote (modal Comprar). Créditos liberam ao pagar/fechar, salvo pagar no modal. Detalhes no guia Pacotes.",
    },
    {
      title: "Usar crédito de pacote (abate + diferença)",
      detail:
        "Se há crédito, “Abater 1 crédito” vem marcado. Cobertura do pacote (R$) default = preço cheio. Baixe a cobertura se o plano não cobre tudo — o residual é a diferença a pagar (badge Crédito + diferença). Desconto % no item aplica no residual. Desmarque o abate só para cobrar avulso. Comissão do serviço fica no preço de tabela.",
    },
    {
      title: "Desconto da comanda",
      detail:
        "No rodapé do drawer, Desconto da comanda (%) → o painel mostra o R$ equivalente sobre o subtotal → Aplicar. Isso reduz o total antes do pagamento.",
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
        "Na própria comanda use Vincular cliente (busca por nome/telefone). Ou abra a comanda já com cliente, ou venda pela ficha: aba Pacotes → Vender pacote.",
    },
    {
      concern: "Removi o item e deu erro de pacote",
      reply:
        "Se a carteira já tinha sido usada (crédito abatido), não dá para remover a venda do pacote. Se ainda não usou, a remoção cancela a carteira.",
    },
  ],
  relatedGuideIds: ["comandas-historico", "pacotes", "consumo-pwa", "caixa", "comissoes"],
  lastVerified: "2026-09-15",
  enrichNotes: ["Permissão reabrir: só owner/admin (isOwnerRole)"],
};

export const guideComandasHistorico: SupportGuide = {
  id: "comandas-historico",
  title: "Histórico e reabrir comanda",
  status: "ready",
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
};

/** S2 — enriquecido a partir de ConsumoMobileApp + staff-consumption + Produtos (uso interno). */
export const guideConsumoPwa: SupportGuide = {
  id: "consumo-pwa",
  title: "Venda / Consumo no celular",
  status: "ready",
  href: "/pwa/consumo",
  menuPath: "Comandas → Venda / Consumo (celular)",
  aliases: [
    "consumo",
    "meu consumo",
    "venda celular",
    "pwa consumo",
    "coca",
    "trufa",
    "cone",
    "produto na comanda celular",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "No celular: vender produto na comanda aberta (preço cheio) ou lançar Meu consumo (−30% na comissão).",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Comandas → Venda / Consumo (celular), ou abra /pwa/consumo no celular. Também pelo atalho App celular (PWA).",
    },
    {
      title: "Aba Venda — produto na comanda do cliente",
      detail:
        "Escolha a comanda aberta na lista → toque no produto em estoque. Lança 1 un. na comanda pelo preço cheio e baixa estoque. Se não há comanda aberta “sua”, peça à recepção para abrir.",
    },
    {
      title: "Aba Meu consumo — desconto do barbeiro",
      detail:
        "Aba Meu consumo → toque no produto. Baixa estoque e lança desconto na comissão: cobra 70% do preço de venda (venda − 30%). A conta precisa estar vinculada a um profissional (Configurações → Equipe).",
    },
    {
      title: "Uso interno da loja (não é esta tela)",
      detail:
        "Baixa de produto de uso interno (sem comanda/comissão) fica em Cadastros → Produtos: o produto precisa estar marcado como Uso interno; aí há ação para baixar 1 un. do estoque.",
    },
  ],
  objections: [
    {
      concern: "Não aparece nenhuma comanda na Venda",
      reply:
        "Só lista comandas abertas que o usuário pode ver. Peça à recepção para abrir a comanda do cliente (Comandas → Abertas ou pela Agenda).",
    },
    {
      concern: "Meu consumo deu erro de vínculo",
      reply:
        "O login do barbeiro precisa estar ligado a um profissional em Configurações → Equipe de acesso. Sem isso não lança consumo.",
    },
    {
      concern: "Onde lanço uso interno / produto da casa?",
      reply:
        "Não é no PWA de consumo. Vá em Cadastros → Produtos, marque Uso interno no produto e use a baixa de estoque por lá.",
    },
    {
      concern: "Consumo aparece nas comissões?",
      reply:
        "Sim: Financeiro → Comissões. O valor descontado é preço × 70% (venda − 30%).",
    },
  ],
  relatedGuideIds: ["comandas", "produtos", "comissoes", "pwa-app", "equipe-acesso"],
  lastVerified: "2026-09-15",
  enrichNotes: ["FAQ uso-interno alinhado para Produtos, não PWA"],
};

