# Sprints — RagnaroK / Donna SaaS

Planejamento controlado. **Tenant ativo de referência:** `ragnaroks` (RagnaroK's Barbearia).

## Estado atual

| Sprint | Status | Entrega |
|--------|--------|---------|
| **0 — Fundação** | ✅ concluído | Auth, tenant context, `server/`, Drawer/Modal |
| **1 — Clientes** | ✅ concluído | CRUD + Drawer + ficha (histórico) |
| **2 — Profissionais** | ✅ concluído | CRUD + jornada semanal no Drawer |
| 3 — Agenda operacional | pendente | Modal agendar/bloquear/encaixe |
| 4 — Comanda | pendente | Abrir → itens → pagamento |
| 5 — Financeiro real | pendente | Sessão caixa, fluxo, comissões no fechamento |
| 6 — IA / Donna | pendente | Evolution, conversas, tenant 2 |

---

## Sprint 2 — Profissionais ✅

### Entregue
- **+ Novo profissional** abre Drawer
- **Clique na linha** abre ficha (cadastro + jornada)
- Campos: nome, apelido, telefone, e-mail, comissão %, cor na agenda, bookable
- Aba **Jornada**: até 2 turnos por dia da semana
- **Inativar / reativar** com confirmação
- Resumo: total agendamentos e itens em comandas
- Lógica em `src/server/staff/` + server actions
- Filtros: ativos, removidos, todos

---

## Sprint 1 — Clientes ✅

### Entregue
- **+ Novo cliente** abre Drawer lateral
- **Clique na linha** abre ficha para editar
- Campos: nome, telefone, e-mail, nascimento, observações
- **Inativar** (soft delete) com confirmação Modal
- **Reativar** clientes removidos
- Link **WhatsApp** na ficha (quando há telefone)
- Lógica em `src/server/clients/` + server actions
- Permissão: owner, admin, manager

---

## Sprint 0 — Fundação SaaS ✅

### Entregue
- Login `/login` + sessão JWT (cookie httpOnly)
- Middleware protege todo o painel
- `requireSession()` / `requireTenantContext()` — tenant vem da sessão, não de env
- Camada `src/server/` (auth, errors, context)
- Componentes `Drawer` e `Modal` prontos para Sprint 1+
- Seed: `npm run seed:owner`

### Setup owner (uma vez por ambiente)
```bash
SEED_OWNER_EMAIL=seu@email.com SEED_OWNER_PASSWORD=******** npm run seed:owner
```

### Variáveis obrigatórias
- `DATABASE_URL`
- `AUTH_SECRET` (mín. 32 caracteres)

---

## Prioridade financeira (melhorar AppBarber)

O AppBarber mistura caixa, comandas e relatórios. Nossa espinha (ver `ARCHITECTURE.md`):

1. **Operacional** — `orders` + `order_items` + `payments` (já importados)
2. **Caixa** — `cash_sessions` + `cash_movements` (Sprint 5 — sessão aberta/fechada)
3. **Relatórios** — leitura consolidada; Sprint 5 passa a refletir operações novas
4. **Fluxo / Contas** — `/modulo/fluxo-caixa`, `/modulo/contas` (pós Sprint 5)

Relatório **Gerencial — Financeiro** será evoluído sprint a sprint; não expandir só a vitrine read-only.

---

## Regras de sprint

1. Uma feature **completa** por sprint (listar + ver + criar + editar + regras).
2. Toda lógica em `src/server/<domínio>/`, pages só renderizam.
3. `tenant_id` sempre do contexto de sessão.
4. UI: Drawer para ficha, Modal para ação pontual.
