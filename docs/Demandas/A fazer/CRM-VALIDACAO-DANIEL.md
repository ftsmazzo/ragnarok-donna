# CRM Ragnarok — validado (2026-09-20)

Respostas do Daniel / operação. **Escopo fechado para construir.**

---

## Decisões

| Pergunta | Resposta |
|----------|----------|
| Topo de funil | Já no **primeiro contato por WhatsApp** (não só cadastro manual) |
| Frequência | Pelo **histórico de cada cliente** (sem prazo fixo igual para todos) |
| Lista do dia | **Tela nova de CRM** + também em **Lembretes** |
| Assinatura | **Sim** — incluir assinatura mensal (próximos clientes / produto) |
| Prioridade no funil | **Origem → Ficha → Quem está na hora de voltar** |

---

## O que o CRM faz (visão acordada)

### 1. Ficha única
Uma pessoa = uma ficha. Nome, WhatsApp, Instagram, e-mail, aniversário, barbeiro preferido, interesses, obs, opt-in de mensagem. Status: lead / cliente / sumiu.

### 2. Origem (cedo)
Canal + campanha quando houver. No **primeiro Zap** já nasce lead no topo do funil com origem WhatsApp (e depois enriquece: Instagram, Google, indicação, porta, parceria, QR, site…).

### 3. Funil
Interessado → Conversamos → Qualificamos → Agendou → Veio → Fez o serviço → Cliente  
Saídas: não respondeu, não agendou, faltou, perdeu (motivo).

Cada mudança com data e quem mexeu.

### 4. Consumo na ficha
Primeira/última visita, vezes, gasto, ticket, dias sem vir, serviço/barbeiro top, próximo horário.

### 5. Frequência real
Ritmo por histórico → Novo / Recorrente / Janela de retorno / Em risco / Inativo / Reativado.  
Lista do dia: chamar esta semana, atrasados, 1ª visita sem retorno, planos/assinaturas perto de vencer.

### 6. Pacotes + assinatura mensal
Pacote atual (créditos) **e** assinatura mensal (recorrente) para novos clientes / planos futuros — ativo / atrasado / cancelado / vencimento.

### 7. Painel dono (depois do MVP)
Leads por canal, conversão, veio/faltou, faturamento, novos vs recorrentes, atrasados, receita por barbeiro, ROI por canal.  
Disparos WhatsApp depois, ligados à lista — sem outro sistema paralelo.

---

## Ordem de construção (MVP → depois)

1. **Origem + ficha** — campos, cadastro, lead no 1º WhatsApp  
2. **Funil** — etapas/saídas na ficha e lista por etapa  
3. **Quem está na hora de voltar** — motor de frequência + **tela CRM** + cards em Lembretes  
4. **Assinatura mensal** — modelo + venda/renovação (além do pacote de créditos)  
5. Painel dono / ROI canal / disparos a partir da lista  

---

## Fora deste CRM (continua em lembretes)

- Financeiro parrudo  
- Venda 24/7  
- Comissão por meta (espera regra fechada)

---

## Próximo passo técnico

Abrir Issues no GitHub na ordem acima (`tipo:nova-função` / `tipo:melhoria`) e implementar o MVP 1→3 antes de assinatura e dashboard.
