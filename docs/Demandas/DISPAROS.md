# Fase 3 — Disparos WhatsApp

Config por unidade em **Configurações → Disparos WhatsApp** (dono/admin/recepção).

## Motor
- Fila: `outreach_jobs`
- Tick: `POST/GET /api/ops/outreach-tick` (Bearer `CRON_SECRET` | `AUTH_SECRET` | `AGENT_SERVICE_TOKEN`)
- EasyPanel: criar cron HTTP a cada **10 min** apontando para a URL do app + header Authorization

Exemplo:
```
GET https://<host>/api/ops/outreach-tick
Authorization: Bearer <CRON_SECRET ou AUTH_SECRET>
```

## Kinds
| kind | Uso |
|------|-----|
| `confirmation_daily` | Confirmação amanhã → cliente responde OK → agenda verde |
| `followup_inactive` | Retorno 30/60 nos dias do mês |
| `sunday_blast` | Blast domingo |
| `empty_agenda` | Profissional sem agenda amanhã → clientes dele |

Toggles começam **desligados**.

## Validação recomendada (gate)
1. Ligar só **Confirmação diária**
2. Criar horário `scheduled` amanhã com telefone
3. Rodar tick (ou esperar horário configurado)
4. Responder `ok` no Zap → slot verde
5. Só então ligar retorno/blast/agenda vazia
