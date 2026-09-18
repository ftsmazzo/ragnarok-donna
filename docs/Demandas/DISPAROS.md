# Fase 3 — Disparos WhatsApp

Config por unidade em **Configurações → Disparos WhatsApp** (dono/admin/recepção).

## Kill switch (obrigatório em desenvolvimento)

```text
OUTREACH_DISPATCH_ENABLED=false   # padrão / seguro — NÃO envia WhatsApp
OUTREACH_DISPATCH_ENABLED=true    # só depois da migração dos clientes
```

Sem `true`, o tick responde `skipped` e **nenhuma mensagem sai**, mesmo com toggles ligados.
Serviço EasyPanel `outreach-cron` fica **parado** até a liberação.

Motivo: clientes ainda no AppBarber — disparo agora gera confusão.

## Motor
- Fila: `outreach_jobs`
- Tick: `POST/GET /api/ops/outreach-tick` (Bearer `CRON_SECRET` | `AUTH_SECRET` | `AGENT_SERVICE_TOKEN`)
- Cron HTTP (quando liberar): a cada ~10 min

## Kinds
| kind | Uso |
|------|-----|
| `confirmation_daily` | Confirmação amanhã → cliente responde OK → agenda verde |
| `followup_inactive` | Retorno 30/60 nos dias do mês |
| `sunday_blast` | Blast domingo |
| `empty_agenda` | Profissional sem agenda amanhã → clientes dele |
| `birthday` | Aniversário automático (toggle; default off) |

Toggles começam **desligados**.

### Aniversário — humano vs auto
- **Manual (preferido):** Clientes → Aniversariantes → Enviar Zap. Sai como `outbound_human` imediato (WhatsApp conectado). **Não** passa pela fila nem pelo kill switch `OUTREACH_DISPATCH_ENABLED`.
- **Automático:** toggle em Disparos → kind `birthday` na fila. Só envia com `OUTREACH_DISPATCH_ENABLED=true` e cron ativo. Manter off até a loja validar o fluxo manual.

## Quando liberar produção
1. Clientes migrados / WhatsApp da unidade no Evolution
2. `OUTREACH_DISPATCH_ENABLED=true` no EasyPanel
3. Start do serviço `outreach-cron`
4. Ligar só **Confirmação diária** e validar OK→verde
5. Depois retorno/blast/agenda vazia
6. Aniversário automático só depois do envio manual estabilizado
