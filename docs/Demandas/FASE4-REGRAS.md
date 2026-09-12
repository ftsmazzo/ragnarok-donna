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
- **Almoço 12h–14h:** bloqueia encaixe; Donna `list_slots` pula a faixa
- **Almoços escalonados:** se 3+ profissionais com almoço na mesma janela → alerta info em `/alertas`
- **Luciano/Diogo:** aviso se agendar sem indício de pedido pelo profissional
- **Handoff:** recusa espera / troca de profissional sem solução → `handoff_human`
- **Recorrência ~10d:** alerta em `/alertas`
- **Clientes frequentes sem horário:** 2+ visitas em 21d e sem próximo agendamento → alerta
- **Extras + meta:** ranking de produtos por profissional em `/relatorios/extras` (cadastro de meta mensal); resumo semanal também em `/alertas`
- **Menu botão direito (AppBarber):** no card da agenda — Abrir/Finalizar comanda, Ausente, Cancelado, Confirmar/Desconfirmar, Sem preferência, Encaixe, Venda, Tag, No Local; mesmas ações no modal de detalhes
- **Linha temporal:** no dia de hoje, faixa vermelha “agora” atravessa a grade e sobe a cada minuto (fuso SP)
- **Status de msg Zap:** webhook `MESSAGES_UPDATE` → Enviado / Entregue / Lido nas Conversas; se o cliente desliga ✓✓ azul, mostra no máximo Entregue + “Respondeu” quando houver resposta. Reconecte o WhatsApp uma vez para registrar o evento no webhook.
