# Arquitetura — visão Sprint 0+

## Camadas

```
┌─────────────────────────────────────────┐
│  app/(painel)/*   pages (Server Components) │
├─────────────────────────────────────────┤
│  components/ui     Drawer, Modal          │
│  components/features/*  (Sprint 1+)       │
├─────────────────────────────────────────┤
│  src/server/       lógica de negócio      │
│    auth/           login, sessão          │
│    context/        tenant, RBAC           │
│    clients/        (Sprint 1)             │
│    agenda/         (Sprint 3)             │
│    orders/         (Sprint 4)             │
│    finance/        (Sprint 5)             │
├─────────────────────────────────────────┤
│  Drizzle + Postgres (tenant_id em tudo)   │
└─────────────────────────────────────────┘
```

## Multi-tenant

- **Tenant** = barbearia/salão (`tenants`)
- **User** pode ter vários tenants via `memberships`
- Sessão carrega `tenantId` + `role` (owner, admin, manager, staff, readonly)
- RagnaroK (`ragnaroks`) = tenant de desenvolvimento e validação
- Donna = segundo tenant quando houver export (Sprint 6+)

## Espinha financeira (melhor que AppBarber)

AppBarber acopla caixa, comanda e relatório. Separamos responsabilidades:

| Camada | Tabelas | Responsabilidade |
|--------|---------|------------------|
| **Consumo** | `orders`, `order_items` | O que foi vendido/feito |
| **Pagamento** | `payments` | Como pagou (PIX, cartão…) |
| **Caixa** | `cash_sessions`, `cash_movements` | Turno do operador, sangria/suprimento |
| **Comissão** | `order_items.commission_*` + `staff_advances` | Provisionada no item; vales/bônus/liquidação no ledger |
| **Relatório** | queries read-only | DRE simplificado, por forma, por profissional, fluxo |
| **Futuro** | contas a pagar/receber | `/modulo/contas`, fluxo projetado com taxas |

### Fluxo alvo (Sprint 4–5)

```
Agendamento → Comanda aberta → Itens → Fechar comanda
                                      ↓
                              payments (1..n)
                                      ↓
                              cash_movement (se caixa aberto)
                                      ↓
                              comissão provisionada
```

### O que temos hoje (pós-import)

- Dados históricos em `orders` / `payments` — relatórios read-only OK
- `cash_sessions` vazio — caixa na UI é **derivado** de pagamentos até Sprint 5
- Relatório financeiro: agregação por `payments.method` — base correta, falta sessão e movimentos manuais

## UI — padrões

| Padrão | Componente | Uso |
|--------|------------|-----|
| Ficha / edição | `Drawer` | Cliente, comanda do dia |
| Ação rápida | `Modal` | Agendar slot, confirmar pagamento |
| Lista | `DataTable` + paginação | Já usado nos cadastros |
| Relatório | `RelatorioFilters` + `SummaryCards` | Período + KPIs |

## API externa (futuro)

`app/api/` para agente WhatsApp e n8n — sempre com `tenant_id` validado por token de serviço, nunca confiar só no body.
