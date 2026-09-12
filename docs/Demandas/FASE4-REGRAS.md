# Fase 4 — Regras da casa

Kill switch de WhatsApp (`OUTREACH_DISPATCH_ENABLED`) continua valendo: alertas no painel funcionam; mensagens Zap só quando liberar.

## Check-in
- Cliente com horário **hoje** (`scheduled`/`confirmed`) manda “estou na barbearia” / “cheguei” → status **arrived**
- Donna não trata isso como encaixe (regra 17 / skill 6c)

## Alerta +5 min
- Em `/alertas`: clientes do dia que passaram 5 min do horário e ainda não estão `in_progress`/`completed`

## Atraso (Zap — só com dispatch on)
- +10 min sem check-in → “você vem?”
- +15 min (corte/barba) ou +20 min (cabelo+barba/combo) → remarcação

## Demais
- **Sábado + encaixe:** aviso no retorno do agendamento
- **Almoço 12h–14h:** bloqueia encaixe
- **Luciano/Diogo:** aviso se agendar sem indício de pedido pelo profissional
- **Recorrência ~10d:** alerta em `/alertas`
- Read receipt / metas ranking: fora deste corte (discovery)
