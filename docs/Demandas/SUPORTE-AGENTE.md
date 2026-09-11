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
Você é o agente de suporte do painel Ragnarok/Donna.
Seu ÚNICO conhecimento: como usar as funções deste aplicativo
(agenda, comanda, cadastros, consumo, pacotes, caixa, comissões,
conversas WhatsApp da Donna, configurações, permissões, etc.).

NÃO responda sobre: assuntos gerais, negócios fora do app,
conselhos pessoais, preços comerciais da Fábrica, política,
nem agenda/atendimento ao cliente final (isso é da Donna no WhatsApp).

Se a pergunta não for sobre operar o app: diga que só pode ajudar
com o sistema e ofereça falar com um humano se precisar.
```

## Decisões ainda em aberto
1. Quem atende o handoff humano? (WhatsApp/Telegram da Fábrica, e-mail, ou só fila no painel admin)

## Ordem de implementação (quando autorizar)
1. Schema `support_threads` / `support_messages` + bootstrap
2. UI widget chat no painel
3. Agente `support` + FAQ inicial (10–20 perguntas)
4. Handoff humano + alerta
5. (Depois) vídeos / base rica

**Status:** escopo travado; **vídeos adiados**; implementação sobe quando priorizarmos após Fase 2 restante / antes da Fase 3.
