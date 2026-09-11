# Fase 3 — Disparos WhatsApp

Config por unidade em **Configurações → Disparos WhatsApp** (dono/admin/recepção).

## Motor
- Fila: `outreach_jobs`
- Tick: `POST/GET /api/ops/outreach-tick` (Bearer `AUTH_SECRET` | `AGENT_SERVICE_TOKEN` | `CRON_SECRET`)
- EasyPanel: cron a cada 5–15 min

## Kinds
| kind | Uso |
|------|-----|
| `confirmation_daily` | Confirmação amanhã → cliente responde OK → agenda verde |
| `followup_inactive` | Retorno 30/60 nos dias do mês |
| `sunday_blast` | Blast domingo |
| `empty_agenda` | Profissional sem agenda amanhã → clientes dele |

Toggles começam **desligados**.
