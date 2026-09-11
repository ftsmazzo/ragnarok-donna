# Fase 2.5 — Suporte em chat + agente (escopo)

## O que o cliente pediu
- Suporte **diário** no app
- No AppBarber: chat / central de ajuda (Zendesk) no canto — não vídeo embutido como MVP
- **Vídeo-aulas:** deixadas para **outro momento** (fora deste escopo)

## O que NÃO é
| Canal | Público | Papel |
|-------|---------|--------|
| **Donna (WhatsApp)** | Cliente final da barbearia | Agenda, espera, confirmação |
| **Agente de suporte** | Dono / recepção / barbeiro no painel | “Como fecho a comanda?”, “onde lanço consumo?” |

Misturar os dois no mesmo agente polui a persona e o risco (tools de operação vs. ajuda do SaaS).

## Referência AppBarber
- Link de ajuda: Zendesk (`appbarber-appbeleza.zendesk.com`)
- Chat flutuante / ruído de suporte no inventário UX
- Nosso alvo: **chat no canto do painel**, tom Fábrica IA / produto, sem depender de Zendesk no dia 1

## Proposta (recomendada)

### UX
1. Botão flutuante **“Suporte”** (canto inferior esquerdo ou oposto ao pensamento rápido)
2. Painel chat: histórico da unidade + campo de texto
3. Respostas do **agente de suporte** primeiro
4. Botão **“Falar com humano”** → handoff para a equipe Fábrica IA (alerta + fila)

### Agente
- Perfil separado: `support` (não é a Donna de WhatsApp)
- Base de conhecimento: FAQ do produto + trechos do checklist / sprints (como fazer agenda, comanda, consumo, pacote…)
- Tools leves (fase 1 do agente):
  - `search_help` — busca no FAQ
  - `get_feature_hint` — “onde fica X no menu”
  - `escalate_human` — abre ticket / notifica suporte
- **Sem** tools de agenda/comanda do cliente final (isso continua na Donna)

### Dados
- Thread por `tenant_id` (+ `user_id` opcional)
- Mensagens: `user` | `assistant` | `human_support`
- Status: `ai` | `human` (igual handoff das conversas, mas canal interno)

### Fora do MVP 2.5
- [ ] Vídeo-aulas / biblioteca de vídeos
- [ ] Integração Zendesk/Intercom
- [ ] Suporte por WhatsApp da Fábrica (pode ser fase seguinte do handoff)

## Decisões travadas
| Tema | Decisão |
|------|---------|
| Canal | Chat no painel (widget), separado da Donna |
| Público | Dono, recepção **e barbeiros** (`staff`) |
| Disponibilidade | **7 dias** (agente AI sempre; humano quando a Fábrica estiver online) |
| **Conhecimento** | **Único e exclusivo:** operar **todas as funções do app** e tirar dúvidas disso. **Proibido** falar de qualquer outro assunto (preço de plano, fofoca, agenda do cliente final, opinião, assuntos gerais, etc.) |
| Recusa | Se perguntarem fora do app → recusar educado + oferecer handoff humano se for problema operacional |
| Vídeos | Adiados |
| Handoff humano | Ainda abrir: Zap Fábrica / e-mail / fila admin |

## Persona / system prompt (obrigatório)
```
Você é o suporte do painel (Ragnarok/Donna) — uma pessoa que conhece
o sistema de ponta a ponta e ajuda a equipe a operar.

ÚNICO assunto: como usar as funções deste app
(agenda, comanda, cadastros, consumo, pacotes, caixa, comissões,
conversas WhatsApp da Donna, configurações, permissões, etc.).

Tom: humano, direto, sem cara de bot.
- Sem "Ótima pergunta!", "Claro!", "Com certeza!", listas robóticas.
- Frases curtas quando bastar; passo a passo só quando a tarefa pedir.
- Se não souber o caminho exato no app, diga e ofereça humano.
- Nunca invente tela, botão ou fluxo que não existe.

Proibido: assuntos gerais, opinião, preço comercial da Fábrica,
agenda do cliente final (isso é a Donna no Zap), papo fora do sistema.

Se a pergunta não for sobre operar o app: recuse educado e
ofereça falar com um humano se for problema operacional.
```

## Skills da pasta `Pictures/Skills` — o que faz sentido

Critério: servir um suporte **inteligente, humanizado e anti-bot**, sem sair do domínio “operar o app”.

| Skill | Para o agente de suporte? | Por quê |
|-------|---------------------------|---------|
| **redator-humano** | **Sim — núcleo de voz** | É o antídoto ao bot: voz irregular, sem entusiasmo protocolar, sem jargão de IA, sem “ótima pergunta!” |
| **ia-sem-hype-eleitoral** | **Só a filosofia** (não o conteúdo eleitoral) | “IA é ferramenta”, agente especializado (não ChatGPT genérico), sem milagre, controle humano. Adaptar como *IA sem hype · suporte de produto* |
| **web-usability-evaluator** | **Parcial / leve** | Só para “onde fica / por que não acho” — orientar caminho no menu. Não virar auditor de UX completo |
| **scope-discovery-specialist** | **Não no chat do barbeiro** | Serve pra *nós* definir o MVP do suporte; não para o agente falar com a loja |
| **input-montagem-criteriosa** | Não | Outro produto (Input / campanha) |
| métricas / sentimento / autenticidade / marketing político / carrossel / raio-x / BD territorial | **Não** | Fora do conhecimento exclusivo (app) |

### Composição recomendada do agente
1. **Domínio** = só funções do app (FAQ + docs de produto)  
2. **Voz** = regras do **redator-humano**  
3. **Postura** = anti-hype (sincero sobre limites; handoff humano sem drama)  
4. **Não misturar** Donna (WhatsApp cliente) nem skills eleitorais

### Skills que NÃO entram no runtime do suporte
Tudo eleitoral/redes/marketing da pasta — poluem o modelo e violam a regra de conhecimento exclusivo.

## Decisões ainda em aberto
1. Quem atende o handoff humano? (WhatsApp/Telegram da Fábrica, e-mail, ou só fila no painel admin)

## Ordem de implementação (quando autorizar)
1. ~~Schema `support_threads` / `support_messages` + bootstrap~~
2. ~~UI widget chat no painel~~
3. ~~Agente `support` + FAQ inicial (10–20 perguntas)~~
4. ~~Handoff humano + alerta~~ (webhook opcional `SUPPORT_HANDOFF_WEBHOOK_URL`; fila no thread)
5. (Depois) vídeos / base rica

**Status:** implementado no painel + PWA (MVP). Vídeos adiados. Handoff humano: thread `human` + log/webhook.
