# EasyPanel — projeto `ragnarok-donna`

Infra compartilhada do SaaS multi-tenant (**RagnaroK's Barbearia** + **Donna** Salão).

Painel: mesmo cluster FabriaIA (`*.kxryyk.easypanel.host`).

## Serviços

| Serviço | Tipo | URL / host |
|--------|------|------------|
| `db` | Postgres `pgvector/pgvector:pg17` | interno `ragnarok-donna_db:5432` |
| `redis` | Redis 7 | interno `ragnarok-donna_redis:6379` |
| `evolution` | Evolution API `v2.3.7` | https://ragnarok-donna-evolution.kxryyk.easypanel.host |
| `n8n` | n8n `2.31.7` | https://ragnarok-donna-n8n.kxryyk.easypanel.host |
| `app` | Next.js (painel SaaS) | https://ragnarok-donna-app.kxryyk.easypanel.host |

DbGate (opcional): `https://ragnarok-donna-db-dbgate.kxryyk.easypanel.host`

## Bancos no Postgres

| Database | Uso |
|----------|-----|
| `ragnarok` | App SaaS (Drizzle / schema do produto) |
| `evolution` | Evolution API |
| `n8n` | Metadados n8n |

Usuário: `postgres` (senha no EasyPanel → serviço `db`).

## Connection strings (rede interna EasyPanel)

```text
# App SaaS
DATABASE_URL=postgres://postgres:<SENHA>@ragnarok-donna_db:5432/ragnarok

# Redis
REDIS_URL=redis://default:<SENHA_REDIS>@ragnarok-donna_redis:6379/0

# Evolution (já configurada no serviço)
# URI interna: postgresql://postgres:<SENHA>@ragnarok-donna_db:5432/evolution?schema=public
```

## Evolution — patch Baileys (obrigatório)

A imagem `evoapicloud/evolution-api:v2.3.7` vem com `baileys@7.0.0-rc.9`.
Sem o bump, mensagens outbound ficam em **PENDING** e **não chegam no Zap**
(erro WhatsApp 463 / tctoken).

No EasyPanel → `evolution` → Deploy → **Command**:

```bash
sh -c "npm install baileys@7.0.0-rc13 --force --legacy-peer-deps && node -e \"const p=require('baileys/package.json'); console.log('[baileys-patch]', p.version); if(!String(p.version).includes('rc13') && !String(p.version).includes('rc.13')) { console.error('Baileys patch failed'); process.exit(1); }\" && npm run db:deploy && npm run db:generate && npm run start:prod"
```

No log de boot deve aparecer: `[baileys-patch] 7.0.0-rc13`.
Depois de redeploy, se a sessão cair, reconecte o QR em `/conversas`.

## Chaves de integração


| Variável | Onde |
|----------|------|
| `AUTHENTICATION_API_KEY` | EasyPanel → `evolution` → env |
| `N8N_ENCRYPTION_KEY` | EasyPanel → `n8n` → env (não rotacionar após workflows com credenciais) |

## Ainda não provisionado

- App Next do SaaS (deploy Git / imagem)
- Domínios custom (ex.: app.cliente.com)
- Instâncias WhatsApp no Evolution (uma por tenant: RagnaroK, Donna)

## Deploy do app

O app **não exige terminal** no EasyPanel. Na subida (`npm start` / Docker), `scripts/start-production.mjs`
vincula automaticamente clientes ↔ agenda ↔ comandas no Postgres antes de subir o Next.js.

Opcional: incluir `data/appbarber-export/agenda.json` + `comandas-historico.json` na imagem
Docker (ver `data/appbarber-export/README.md`) para reparo completo via export AppBarber.

## Próximos passos

1. `db:push` do schema Drizzle no banco `ragnarok`
2. Seed dos tenants Donna + RagnaroK
3. ETL AppBarber → Postgres
4. Deploy do app + webhook Evolution → n8n / agente
