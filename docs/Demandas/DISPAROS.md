# Fase 3 — Disparos WhatsApp (estrutura anti-ban)

Config por unidade em **Configurações → Disparos WhatsApp** (dono/admin/recepção).

## Kill switch e dry-run (obrigatório)

```text
OUTREACH_DISPATCH_ENABLED=false   # padrão — NÃO envia WhatsApp real
OUTREACH_DISPATCH_ENABLED=true    # só depois de dry-run OK

OUTREACH_DRY_RUN=true             # opcional; força simulação mesmo com dispatch on
OUTREACH_ALLOW_SUNDAY_BLAST=true  # obrigatório além do toggle para blast domingo
```

Na unidade: toggle **Dry-run** (default on) — simula fila (`status=dry_run`) sem Evolution.

Sem `OUTREACH_DISPATCH_ENABLED=true` **e** dry-run off, **nenhuma mensagem sai**.
Serviço EasyPanel `outreach-cron` fica **parado** até a liberação.

## Motor
- Fila: `outreach_jobs`
- Tick: `POST/GET /api/ops/outreach-tick` (Bearer `CRON_SECRET` | `AUTH_SECRET` | `AGENT_SERVICE_TOKEN`)
- Cron HTTP (quando liberar): a cada ~10 min

## Anti-ban (camadas)

| Camada | Regra |
|--------|-------|
| Variantes | Pool 3–5 textos/kind; `hash(phone+dayKey+kind) % N` |
| Janela | Âncora `confirmationSendTime` ±30–60 min; `scheduledAt` espalhado |
| Quiet hours | 22h–08h SP — tick não envia |
| Caps | 8/tick · 30/hora · **dailyCap** (default 100) |
| Cadência | Máx. 1 auto-outreach/telefone/24h (exceto `voce_vem` / `delay_reschedule`) |
| 1 kind/tick | Prioridade: confirmation → empty → followup → birthday → … → sunday_blast |
| Sunday blast | Toggle + `OUTREACH_ALLOW_SUNDAY_BLAST` |

Constantes: `src/server/outreach/pacing.ts`.

## Kinds
| kind | Uso |
|------|-----|
| `confirmation_daily` | Confirmação amanhã → OK → agenda verde (**primeiro a liberar**) |
| `followup_inactive` | Retorno 30/60 nos dias do mês |
| `sunday_blast` | Blast domingo — **bloqueado** até flag explícita |
| `empty_agenda` | Profissional sem agenda amanhã (cap baixo) |
| `birthday` | Aniversário automático (toggle; default off) |
| `voce_vem` / `delay_reschedule` | House-rules — operacionais, fora do teto 1/24h |

### Aniversário — humano vs auto
- **Manual (preferido):** Clientes → Aniversariantes → Enviar Zap (`outbound_human`).
- **Automático:** toggle + fila; só com dispatch on e dry-run off.

## Gate de liberação (produção)

1. Dry-run 2–3 dias só com **confirmação** ligada — ver amostra de textos no painel
2. Failures Evolution baixas / WhatsApp estável
3. `OUTREACH_DISPATCH_ENABLED=true` + dry-run **off** na unidade
4. Start do `outreach-cron`
5. Demais kinds um a um (empty → followup 30 → …)
6. sunday_blast por último + `OUTREACH_ALLOW_SUNDAY_BLAST`

## Painel
- Métricas: sent / dry-run / failed / pending / caps
- Amostra dos últimos bodies (variantes)
