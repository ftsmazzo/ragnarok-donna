# Checklist de demandas — Ragnarok / Donna

Fonte: lista WhatsApp do cliente (set/2026).  
Ordem: bloco a bloco, sem pular fase.

## Fase 0 — Já entregue (validar)
- [x] Calendário na sidebar da agenda
- [x] Horários disponíveis / Lista de agendamentos / Lista de espera
- [x] Abate recorrência/pacote na comanda (crédito + comissão tabela)

## Fase 1 — Operação comanda / CRM — feita
- [x] Abrir comanda na agenda sem sair da tela
- [x] Pagar e fechar em um passo
- [x] Bloqueio com motivo + quem bloqueou
- [x] Confirmado = verde
- [x] Cadastro: telefone, por onde conheceu, indicação
- [x] Pagamentos: PIX chave, Link Rede, Infinity (rótulo)
- [x] Alerta comanda aberta > 1h

## Fase 2 — Mobile / agenda — em andamento
- [x] 2.1 Venda + consumo barbeiro (−30%) + uso interno dona
- [x] 2.2 Foto do cliente no agendamento / cadastro
- [x] 2.3 Encaixe imediato no painel + Donna sem slot passado  
      (encaixe ≠ “estou na barbearia” — ver Fase 4)
- [x] 2.4 Widget pensamento rápido (ex.: “Luciano tem 15h / 15h30”)
- [x] 2.5 Suporte em chat (estilo AppBarber) + **agente de suporte**  
      · Vídeo-aulas: **adiado** (outro momento)  
      · Ver `docs/Demandas/SUPORTE-AGENTE.md`

## Fase 3 — Disparos WhatsApp
- [x] Dias 5–6 / 10–11 / 20–21 → clientes 30/60 dias
- [x] Confirmação diária + feriado/domingo
- [x] Blast semanal / domingo
- [x] Agenda vazia de um profissional → disparo só dos clientes dele
- [x] Confirmação auto: “ok” no Zap muda status/cor na grade
- [x] Alarme/som opcional
- Doc: `docs/Demandas/DISPAROS.md` · UI: `/configuracoes/disparos`
- Motor: `POST/GET /api/ops/outreach-tick` (Bearer CRON_SECRET / AUTH_SECRET)
- **Gate:** validar confirmação + OK→verde com toggle ligado antes de ligar blast/retorno em produção

## Fase 4 — Regras da casa (NÃO PULAR)
### Check-in “cliente está no local” (explícito do cliente)
- [x] Cliente marca **“estou na barbearia”** (já tem horário) → check-in / status chegou
- [x] Se passar **5 min do horário agendado** e ainda **não foi atendido** → **alerta** para secretaria/equipe
- [x] Fluxo Zap se não chega / não responde: “você vem?” → depois orientar remarcação (15 min / regras dela)  
      · Zap só com `OUTREACH_DISPATCH_ENABLED=true`

### Atraso do cliente
- [x] Só corte ou só barba: tolerância **15 min** → mensagem de remarcação
- [x] Cabelo + barba: tolerância **20 min** → mensagem de remarcação

### Demais regras Fase 4
- [x] Sábado: alerta ao encaixar; deixar ~30 min livres fora do almoço (aviso operacional)
- [x] Luciano / Diogo: aviso ao agendar se não ficou claro que pediu por eles
- [x] Não encaixar no almoço (12h–14h bloqueado)
- [x] Almoços escalonados (3+ profissionais na mesma faixa) — alerta em `/alertas` + Donna não lista slots 12–14
- [x] Mudança de profissional / sem horário desejado → handoff_human (secretaria)
- [x] Alerta clientes semanais sem agendar (2+ visitas/21d sem próximo horário)
- [x] Alerta recorrência fechada e não remarcada (~10 dias)
- [x] Metas / ranking extras por profissional (produtos da semana em `/alertas`)
- [ ] Read receipt (visualizou msg) — discovery; não prometer sem viabilidade
- Doc: `docs/Demandas/FASE4-REGRAS.md`

## Decisões travadas
| Tema | Decisão |
|------|---------|
| Cor confirmado | Verde |
| Por onde conheceu | Indicação / Instagram / Google / Passou na frente / WhatsApp / Outro |
| Rede / Infinity / PIX chave | Só rótulo operacional |
| Consumo profissional | Preço de venda − 30% |
| Encaixe imediato | Painel (staff); Donna não sobrepõe |
| “Estou na barbearia” | Fase 4 — check-in + alerta 5 min sem atendimento |
| Suporte chat | Agente próprio (≠ Donna); 7 dias; dono+recepção+barbeiro; **só** dúvidas de operar o app; vídeos depois |
