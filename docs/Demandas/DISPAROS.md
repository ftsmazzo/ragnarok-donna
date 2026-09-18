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

## Pacing (anti-rajada / risco Meta)
Constantes em `src/server/outreach/pacing.ts`:

| Regra | Default |
|-------|---------|
| 1 kind por tick | Prioridade: confirmation → empty_agenda → followup → birthday → … → sunday_blast por último |
| Intervalo entre envios | ~4s + jitter até 3s |
| Lote por tick | máx. 8 |
| Teto horário | 30 msgs/hora/tenant |
| empty_agenda cap | 8 clientes/barbeiro + cooldown 14 dias |

Sem pacing ligado, não liberar `OUTREACH_DISPATCH_ENABLED`. **Não** ligar sunday_blast / promo % off neste momento.

## Kinds
| kind | Uso |
|------|-----|
| `confirmation_daily` | Confirmação amanhã → cliente responde OK → agenda verde |
| `followup_inactive` | Retorno 30/60 nos dias do mês |
| `sunday_blast` | Blast domingo — **não liberar** até métricas OK |
| `empty_agenda` | Profissional sem agenda amanhã → clientes dele (cap baixo) |
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
5. Depois empty_agenda (com pacing) → retorno 30d
6. sunday_blast / promo por último — só com aprovação explícita
7. Aniversário automático só depois do envio manual estabilizado
