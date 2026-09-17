import type { SupportGuide } from "./types";

export const guideInicio: SupportGuide = {
  id: "inicio",
  title: "Hoje",
  status: "ready",
  href: "/inicio",
  menuPath: "Hoje",
  aliases: [
    "hoje",
    "início",
    "inicio",
    "home",
    "dashboard",
    "painel inicial",
    "gestão da rede",
    "comparativo",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "objecao", "permissao"],
  summary:
    "Tela inicial da unidade (atalhos e resumo) ou comparativo da rede no modo consolidado.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Hoje (/inicio). Antes chamava-se Início. Na visão consolidada o título vira Gestão da rede / Comparativo Donna.",
    },
    {
      title: "Unidade",
      detail:
        "Cards Agenda hoje, Comandas abertas, Receita/Ticket ou Agendamentos; Alertas da semana; Esta semana; gráficos; atalhos (Agenda, Comandas, Caixa, Conversas, Clientes…). Botão Abrir agenda se tiver permissão.",
    },
    {
      title: "Rede / consolidado",
      detail:
        "Comparativo por unidade (Total Donna / Total rede). Não é operar uma loja — escolha a unidade na topbar para agenda/caixa.",
    },
    {
      title: "Celular",
      detail:
        "No mobile, /inicio sem ?painel=1 costuma redirecionar: gestão → Conversas PWA; barbeiro → Consumo; tablet → Agenda. Use Painel (?painel=1) se precisar do início.",
    },
  ],
  objections: [
    {
      concern: "Apareceu Você não tem permissão",
      reply:
        "Banner de acesso negado (?acesso=negado). Peça ao dono liberar o papel em Equipe de acesso ou use uma tela que seu perfil vê.",
    },
    {
      concern: "Barbeiro: precisa vincular profissional",
      reply:
        "Conta staff sem profissional vinculado. Dono: Configurações → Equipe de acesso → vincular o usuário ao profissional.",
    },
  ],
  relatedGuideIds: ["agenda", "relatorios-visao", "equipe-acesso", "pwa-app"],
  lastVerified: "2026-09-15",
};

export const guideConversasIa: SupportGuide = {
  id: "conversas-ia",
  title: "Conversas IA (WhatsApp da Donna)",
  status: "ready",
  href: "/conversas",
  menuPath: "Conversas IA",
  aliases: [
    "conversas",
    "inbox",
    "whatsapp cliente",
    "donna zap",
    "mensagens",
    "assumir atendimento",
    "devolver à ia",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "Inbox do WhatsApp da barbearia (Donna + handoff humano). Não é o chat de suporte deste app.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Conversas IA (/conversas). Título na tela: Conversas. Dono, admin e gerente. Barbeiro não entra.",
    },
    {
      title: "Não confundir com Suporte",
      detail:
        "O botão flutuante Suporte / Central de ajuda é dúvida de como usar o app (Fábrica). Conversas = cliente no WhatsApp da loja.",
    },
    {
      title: "Conectar WhatsApp",
      detail:
        "Painel WhatsApp · Donna: Criar instância / Gerar QR / Vincular. Status Conectado, Aguardando QR ou Desconectado. Com conectado: Sincronizar inbox.",
    },
    {
      title: "Filtrar e abrir",
      detail:
        "Abas Todas / IA / Humano. Clique na linha → drawer da conversa (Cliente, IA, Você, Sistema).",
    },
    {
      title: "Assumir / devolver",
      detail:
        "Em modo IA: Assumir atendimento. Em humano: digite em Responder ao cliente… → Enviar; depois Devolver à IA. Ficha do cliente se houver cadastro.",
    },
    {
      title: "Pediu humano (banner / fila)",
      detail:
        "Quando o cliente pede a equipe, a Donna para de responder sozinha. No PWA Conversas: badge Pediu humano e banner “Cliente pediu atendimento humano — toque em Assumir.” No painel, abra a conversa — linha Pedido de humano em… no drawer até alguém Assumir atendimento.",
    },
    {
      title: "Sincronizar inbox vs Configurações → Agente",
      detail:
        "Conectar/QR vale para os dois lugares (mesma instância). Sincronizar inbox só aparece em Conversas IA (puxa threads da Evolution). Persona, tom e alerta de handoff ficam em Configurações → Agente (Donna).",
    },
    {
      title: "Limpar inbox",
      detail:
        "Botão Limpar inbox no topo de Conversas. Confirmação: “Apagar todas as conversas e mensagens deste estabelecimento?” — irreversível; não apaga o WhatsApp, só o histórico guardado no painel.",
    },
    {
      title: "PWA Assumir",
      detail:
        "Configurações → App celular (PWA) ou link App celular em Conversas. Abas Todas / IA / Humanos; Assumir e Devolver à IA iguais ao desktop, otimizado para celular da recepção.",
    },
    {
      title: "Atalhos",
      detail:
        "App celular → /pwa/conversas; Lista de retorno → relatório Perfil.",
    },
  ],
  objections: [
    {
      concern: "Estou falando com o suporte ou com o cliente?",
      reply:
        "Se estiver em Conversas IA (ou PWA Conversas), é WhatsApp do cliente. Suporte do painel é o FAB Suporte → Central de ajuda.",
    },
    {
      concern: "Barbeiro não vê Conversas",
      reply:
        "Só dono, admin e gerente. Barbeiro usa Venda / Consumo no celular e a Agenda.",
    },
    {
      concern: "QR não conecta / fica Aguardando QR",
      reply:
        "No celular: WhatsApp → Aparelhos conectados → escaneie de novo. Use Gerar QR / Atualizar QR no Painel WhatsApp · Donna. Se travou, dono em Agente (Donna): Recriar do zero ou Trocar instância (confirme antes).",
    },
    {
      concern: "Status Desconectado",
      reply:
        "Repareie o QR. Enquanto desconectado, a Donna não responde e Disparos/convites por Zap falham. Card mostra Conectado, Aguardando QR ou Desconectado.",
    },
    {
      concern: "Limpei o inbox por engano",
      reply:
        "Não há desfazer — histórico do painel foi apagado. Mensagens antigas no aparelho do WhatsApp podem existir, mas threads novas só voltam com Sincronizar inbox ou novas conversas dos clientes.",
    },
    {
      concern: "Cliente pediu humano e ninguém assume",
      reply:
        "Abra Conversas (filtro IA ou Todas), procure Pediu humano / Pedido de humano e clique Assumir atendimento. Confira Celular da equipe em Agente (Donna) para alerta no Zap da recepção.",
    },
    {
      concern: "Donna respondeu errado — devolver ou mudar persona?",
      reply:
        "Na conversa: Assumir, corrija o cliente, Devolver à IA quando quiser. Para mudar jeito de falar no futuro: Configurações → Agente (Donna) (tom, vocabulário, Identidade) — não confundir com devolver uma thread.",
    },
  ],
  relatedGuideIds: ["agente-donna", "disparos", "pwa-app", "lista-espera"],
  lastVerified: "2026-09-15",
};

export const guideEmpresa: SupportGuide = {
  id: "empresa",
  title: "Dados da empresa",
  status: "ready",
  href: "/configuracoes/empresa",
  menuPath: "Configurações → Dados da empresa",
  aliases: [
    "empresa",
    "unidade",
    "filial",
    "dados da empresa",
    "endereço",
    "nome fantasia",
  ],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "Cadastro da unidade que a Donna usa nas conversas (identidade, endereço, textos).",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Configurações → Dados da empresa (/configuracoes/empresa). Só dono/admin.",
    },
    {
      title: "Preencher",
      detail:
        "Identidade (nome fantasia obrigatório, tagline, slogan, desde); Endereço e contato; Redes; Horários; Textos para a IA (diferenciais, sobre, serviços falados).",
    },
    {
      title: "Salvar",
      detail:
        "Salvar dados da empresa. Mensagem: Dados salvos. A Donna já usa estas informações.",
    },
  ],
  objections: [
    {
      concern: "Onde conecto o WhatsApp?",
      reply:
        "Não é nesta tela. WhatsApp operacional: Conversas IA ou Configurações → Agente (Donna).",
    },
    {
      concern: "Gerente não vê Dados da empresa",
      reply: "Só dono e administrador. Peça a um deles para atualizar o cadastro.",
    },
  ],
  relatedGuideIds: ["agente-donna", "conversas-ia", "equipe-acesso"],
  lastVerified: "2026-09-15",
};

export const guideEquipeAcesso: SupportGuide = {
  id: "equipe-acesso",
  title: "Equipe de acesso",
  status: "ready",
  href: "/configuracoes/equipe",
  menuPath: "Configurações → Equipe de acesso",
  aliases: [
    "equipe",
    "login",
    "senha",
    "permissão",
    "usuário",
    "acesso",
    "criar acesso",
    "vincular profissional",
  ],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer", "permissao", "objecao"],
  summary:
    "Quem entra no painel: criar login, papéis e vínculo com profissional.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Configurações → Equipe de acesso (/configuracoes/equipe). Só dono/admin.",
    },
    {
      title: "Barbeiro sem login",
      detail:
        "Bloco Profissionais sem acesso → Criar acesso (e-mail, senha opcional) → Confirmar acesso. Vários: Criar todos.",
    },
    {
      title: "Gerente / admin / leitura",
      detail:
        "Outros acessos: Nome, E-mail, Senha opcional, Papel (Dono, Administrador, Gerente, Somente leitura), Unidade se preciso → Criar usuário.",
    },
    {
      title: "Ajustar na tabela",
      detail:
        "Papel, Unidade e Profissional vinculado mudam na hora (sem botão Salvar). Barbeiro precisa do vínculo profissional.",
    },
    {
      title: "Quem vê o quê",
      detail:
        "Dono/Administrador: acesso total — Equipe de acesso, Dados da empresa, Agente (Donna), relatórios financeiros (Financeiro, Comandas, Estoque, Fluxo…), módulos e Configurações. Gerente: Agenda, Clientes, Comandas, Caixa, Alertas, Conversas IA, Disparos WhatsApp, Lista de espera, relatórios operacionais (Agendamentos, Extras, Perfil) — sem Equipe, Empresa, Agente, financeiro/estoque nem cadastro de Serviços/Produtos/Pacotes. Barbeiro: Agenda (só a própria coluna), Comandas, Comissões (próprias), Profissionais (ficha dele), Venda / Consumo (celular) — sem Conversas IA. Somente leitura: Início, Agenda e Clientes em consulta + Relatórios → Agendamentos; sem comandas, caixa nem conversas.",
    },
  ],
  objections: [
    {
      concern: "Barbeiro não vê comissões / profissionais",
      reply:
        "Falta vínculo: na tabela, selecione o Profissional vinculado. Sem isso o sistema manda aviso no Início.",
    },
    {
      concern: "Não acho papel Barbeiro no convite manual",
      reply:
        "Barbeiro nasce do bloco Profissionais sem acesso (Criar acesso), não do formulário Outros acessos.",
    },
    {
      concern: "Apareceu acesso negado ao abrir uma tela",
      reply:
        "Redirecionamento para /inicio?acesso=negado: seu papel não entra naquela rota. Dono ajusta o Papel em Equipe de acesso ou use um menu permitido (ex.: barbeiro → Agenda/Consumo).",
    },
    {
      concern: "Esqueci a senha",
      reply:
        "Quem lembra a senha atual: Configurações → Minha conta → Atualizar senha. Esqueceu tudo: dono/admin recria ou redefine em Equipe de acesso (nova senha ou convite).",
    },
    {
      concern: "Quero liberar login de todos os barbeiros de uma vez",
      reply:
        "Profissionais sem acesso → Criar todos (N) — cria acesso para quem tem e-mail no cadastro. Opcional envia WhatsApp se Conversas estiver Conectado.",
    },
    {
      concern: "Convite por WhatsApp não chegou",
      reply:
        "No bloco de criação aparece aviso se WhatsApp desconectado — pareie em Conversas IA (Painel WhatsApp · Donna) antes de Criar acesso / Criar todos.",
    },
  ],
  relatedGuideIds: ["profissionais", "minha-conta", "comissoes", "inicio"],
  lastVerified: "2026-09-15",
};

export const guideMinhaConta: SupportGuide = {
  id: "minha-conta",
  title: "Minha conta",
  status: "ready",
  href: "/configuracoes/conta",
  menuPath: "Configurações → Minha conta",
  aliases: ["minha conta", "perfil", "trocar senha", "senha", "conta"],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary: "Trocar a própria senha do painel (e-mail só leitura).",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Configurações → Minha conta (/configuracoes/conta) ou atalho Conta na topbar. Todos com login.",
    },
    {
      title: "O que aparece",
      detail:
        "E-mail da conta (somente leitura), organização/unidade atual e formulário de senha. Não é a ficha de profissional nem a Equipe de acesso.",
    },
    {
      title: "Alterar senha",
      detail:
        "Senha atual, Nova senha (mín. 8), Confirmar → Atualizar senha. Vale para todas as organizações desse e-mail.",
    },
  ],
  objections: [
    {
      concern: "Não consigo mudar o e-mail",
      reply:
        "Nesta tela o e-mail é só exibição. Peça ao dono outro usuário em Equipe de acesso se precisar de login novo.",
    },
    {
      concern: "Esqueci a senha atual",
      reply:
        "Sem a senha atual não dá para trocar aqui. Peça ao dono/admin recriar o acesso em Equipe de acesso (ou suporte humano da Fábrica).",
    },
  ],
  relatedGuideIds: ["equipe-acesso"],
  lastVerified: "2026-09-15",
};

export const guideAgenteDonna: SupportGuide = {
  id: "agente-donna",
  title: "Agente (Donna)",
  status: "ready",
  href: "/configuracoes/agente",
  menuPath: "Configurações → Agente (Donna)",
  aliases: [
    "donna",
    "agente",
    "persona",
    "whatsapp config",
    "instância",
    "tom de voz",
    "qr code",
  ],
  roles: ["owner", "admin"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "WhatsApp da unidade + persona/tom da Donna. Não é o chat de suporte do painel.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Configurações → Agente (Donna) (/configuracoes/agente). Só dono/admin.",
    },
    {
      title: "WhatsApp da unidade",
      detail:
        "Painel WhatsApp · Donna: Criar instância e conectar / Vincular instância existente, status Conectado · Aguardando QR · Desconectado, Atualizar QR. Conectado: Nome no WhatsApp + Salvar nome, Trocar foto, Sincronizar inbox (também em Conversas). Recriar do zero e Trocar instância (sair do nome antigo) pedem confirmação — apagam sessão Evolution antiga. No celular: WhatsApp → Aparelhos conectados.",
    },
    {
      title: "QR / instância travada",
      detail:
        "Se Vínculo atual difere do sugerido, use Trocar instância. Recriar do zero exige variáveis Evolution no servidor — gera instância nova + QR. Depois escaneie com o número oficial da barbearia.",
    },
    {
      title: "Persona e tom",
      detail:
        "Identidade (nome da agente, negócio, saudação), Tom de voz, Vocabulário, História da marca, Padrão de fala. Orientação, não roteiro rígido.",
    },
    {
      title: "Alerta humano",
      detail:
        "Celular da equipe (DDD + número) para quando o cliente pedir atendimento humano.",
    },
    {
      title: "Salvar",
      detail: "Salvar configuração — fica nesta unidade/tenant.",
    },
  ],
  objections: [
    {
      concern: "Isso muda o chat de Suporte do app?",
      reply:
        "Não. Aqui é só a Donna no WhatsApp do cliente. Suporte do painel é outro agente (Fábrica).",
    },
    {
      concern: "QR / instância não funciona",
      reply:
        "Confira se o aparelho concluiu Aparelhos conectados. Recriar do zero ou Trocar instância apaga a sessão antiga — confirme antes. Inbox também mostra o status e Sincronizar.",
    },
    {
      concern: "Nome no WhatsApp vs nome da instância Evolution",
      reply:
        "Nome no WhatsApp (Salvar nome) é o que o cliente vê no Zap — ex.: Sara | Ragnarok. O nome técnico da instância na Evolution (barbearia-xyz) é outro; Trocar instância não substitui editar o nome visível — use Salvar nome com sessão Conectado.",
    },
  ],
  relatedGuideIds: ["conversas-ia", "disparos", "pwa-app"],
  lastVerified: "2026-09-15",
};

export const guideDisparos: SupportGuide = {
  id: "disparos",
  title: "Disparos WhatsApp",
  status: "ready",
  href: "/configuracoes/disparos",
  menuPath: "Configurações → Disparos WhatsApp",
  aliases: [
    "disparo",
    "disparos",
    "broadcast",
    "campanha",
    "confirmação",
    "blast",
    "retorno 30",
    "retorno 60",
  ],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_gerar", "como_fazer", "objecao"],
  summary:
    "Regras automáticas: confirmação D+1, retorno, blast domingo e agenda vazia — não é envio manual de campanha.",
  steps: [
    {
      title: "Onde fica",
      detail:
        "Menu → Configurações → Disparos WhatsApp (/configuracoes/disparos). Dono, admin e gerente.",
    },
    {
      title: "Regras da casa",
      detail:
        "Tudo começa desligado. Ligue: Confirmação diária (amanhã), Retorno ~30/~60 dias, Blast no domingo, Agenda vazia do profissional, Som/vibração quando cliente confirma.",
    },
    {
      title: "Horários e textos",
      detail:
        "Horário da confirmação (SP), dias do mês, limiares, blast N dias, feriados. Textos com {{nome}}, {{data}}, {{hora}}, {{profissional}}, {{barbearia}}. Preview na confirmação.",
    },
    {
      title: "Salvar",
      detail: "Salvar regras — nesta unidade.",
    },
  ],
  objections: [
    {
      concern: "Liguei o toggle e não sai mensagem",
      reply:
        "Envio global pode estar bloqueado no servidor (migração AppBarber / chave OUTREACH). Toggle da unidade sozinho não basta até a liberação.",
    },
    {
      concern: "Quero mandar uma campanha agora pra lista",
      reply:
        "Disparos são automações agendadas, não blast manual. Follow-up pontual: relatório Perfil do cliente (Copiar msg / Enviar Zap / Donna) ou Conversas.",
    },
  ],
  relatedGuideIds: ["conversas-ia", "agente-donna", "relatorio-perfil"],
  lastVerified: "2026-09-15",
};

export const guidePwaApp: SupportGuide = {
  id: "pwa-app",
  title: "App celular (PWA)",
  status: "ready",
  href: "/pwa/conversas",
  menuPath: "Configurações → App celular (PWA)",
  aliases: [
    "pwa",
    "app celular",
    "celular",
    "instalar app",
    "atalho tela inicial",
  ],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao", "permissao"],
  summary:
    "Atalho no celular: Conversas WhatsApp (handoff) e, à parte, Venda / Consumo para o barbeiro.",
  steps: [
    {
      title: "Conversas no celular",
      detail:
        "Menu → Configurações → App celular (PWA) (/pwa/conversas) ou atalho App celular em Conversas. Dono/admin/gerente.",
    },
    {
      title: "Instalar",
      detail:
        "Banner Instalar / Adicionar à Tela de Início (Chrome/Safari). Não é app da loja de aplicativos — é PWA do navegador.",
    },
    {
      title: "Usar Conversas",
      detail:
        "Filtros Todas / IA / Humanos; Assumir / Devolver IA; alerta Pediu humano. Link Painel volta ao /inicio.",
    },
    {
      title: "Venda / Consumo",
      detail:
        "Outra rota: Comandas → Venda / Consumo (celular) (/pwa/consumo). Barbeiro usa aqui — abas Venda e Meu consumo. Detalhes no guia Consumo PWA.",
    },
  ],
  objections: [
    {
      concern: "Barbeiro não abre App celular (PWA)",
      reply:
        "Esse item do menu é Conversas (só gerente+). Barbeiro deve usar Comandas → Venda / Consumo (celular).",
    },
    {
      concern: "Suporte no celular é a Donna?",
      reply:
        "Não. O FAB Suporte no PWA continua sendo Central de ajuda do produto. Conversas = cliente no Zap.",
    },
  ],
  relatedGuideIds: ["consumo-pwa", "conversas-ia", "agente-donna"],
  lastVerified: "2026-09-15",
};
