# Modelo de dados — SaaS Barbearia + IA

Objetivo: banco **multi-tenant**, pronto para agente WhatsApp e migração AppBarber — não espelho do AppBarber.

## Princípios

1. **`tenant_id` em tudo operacional** — isolamento SaaS.
2. **Dinheiro em centavos** (`price_cents`, `total_cents`) — sem float.
3. **UUID** internos; **`external_source` + `external_id`** para import idempotente.
4. **Agenda e comanda separados** — appointment ≠ order; order_items = consumo.
5. **IA first-class** — conversas, handoff, tools auditadas, uso de tokens.
6. **Soft delete** onde faz sentido (clientes, staff, serviços).

## Domínios

```
platform/   tenants, users, memberships, plans
shop/       branches, staff, clients, services, products, packages, schedules
ops/        appointments, orders, order_items, payments, cash, loyalty
agent/      whatsapp, agent_profiles, conversations, messages, tool_calls, ai_usage
import/     import_runs, import_run_errors
```

## Fluxo operacional

```
Cliente agenda  →  appointments
     ↓ (chegou / iniciou)
Comanda         →  orders
     ↓
Itens           →  order_items (service|product|package)
     ↓
Pagamento       →  payments (+ cash_movements)
```

## Fluxo IA (Donna + Prisma)

```
WhatsApp → webhook → conversations (mode: ai|human)
                  → messages
                  → agent tools → appointments / orders / waitlist
                  → agent_tool_calls (auditoria)
                  → handoff humano (mesmo número)
```

## Entitlements (plans.entitlements)

Sugestão inicial:

| Chave | Tipo | Uso |
|-------|------|-----|
| `max_staff` | number | Limite profissionais |
| `max_branches` | number | Filiais |
| `agent_whatsapp` | boolean | Canal IA |
| `ai_credits_monthly` | number | Cotas |
| `loyalty` | boolean | Fidelidade |
| `inventory` | boolean | Estoque |

## Stack

- PostgreSQL 16+
- Drizzle ORM (`src/db/schema`)
- `DATABASE_URL` → `drizzle-kit push` / migrate

## Próximos passos de implementação

1. ~~Subir Postgres e `npm run db:push`~~ (aplicado em `ragnarok` no EasyPanel)
2. Seed tenant RagnaroK's + Donna + planos
3. Script `import:appbarber` lendo `research/export/...`
4. API tools do agente sobre este schema (não SQL cru no n8n em produção multi-tenant)
5. Ligar telas do painel (`src/app`) aos dados reais
