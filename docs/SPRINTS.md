# Sprints — RagnaroK / Donna SaaS

Planejamento controlado. **Tenant ativo de referência:** `ragnaroks` (RagnaroK's Barbearia).

## Estado atual

| Sprint | Status | Entrega |
|--------|--------|---------|
| **0 — Fundação** | ✅ concluído | Auth, tenant context, `server/`, Drawer/Modal |
| **1 — Clientes** | ✅ concluído | CRUD + Drawer + ficha (histórico) |
| **2 — Profissionais** | ✅ concluído | CRUD + jornada semanal no Drawer |
| **2.5 — Perfis (RBAC)** | ✅ concluído | Dono / Recepção / Barbeiro + menu + guards + Equipe |
| **3 — Agenda operacional** | ✅ concluído | Agendar, bloquear, encaixe, status, escopo barbeiro |
| **4 — Comanda** | ✅ concluído | Abrir → itens → pagamento → fechar |
| **5 — Financeiro real** | ✅ concluído | Sessão caixa, sangria/suprimento, pagamento → caixa |
| **5.5 — Insights / Upsell** | ✅ concluído | Hub relatórios, Perfil, KPIs semanais, dicas na agenda |
| **5.6 — Dashboard visual** | ✅ concluído | Gráficos dinâmicos no painel gerencial |
| **5.7 — Relatórios Barber + Início** | ✅ concluído | 4 gerenciais + comissões + início visual |
| **5.8 — Vales + fluxo** | ✅ concluído | staff_advances, a pagar líquido, fluxo de caixa |
| **5.9 — Follow-up / ações** | ✅ concluído | 60d retorno, recorrência 45d, lista + msg |
| 6 — IA / Donna | pendente | Evolution, conversas, envio agendado |

---

## Sprint 2.5 — Perfis e permissões ✅

### Papéis (UI)
| Papel técnico | Nome na UI | Escopo |
|---------------|------------|--------|
| `owner` / `admin` | Dono / Administrador | Acesso total |
| `manager` | Recepção | Agenda, clientes, comandas, caixa, conversas IA, relatório operacional |
| `staff` | Barbeiro | Própria performance e comissões (vinculado a profissional) |
| `readonly` | Somente leitura | Consulta limitada |

### Entregue
- Matriz central em `src/server/permissions/`
- Menu lateral filtrado por perfil
- Middleware bloqueia URL direta
- **Conversas IA** liberada para Recepção + Dono
- Barbeiro: `/profissionais` → minha performance; `/comissoes` → só próprias
- **Configurações → Equipe de acesso**: alterar papel e vincular barbeiro ↔ profissional
- Métricas de cancelamento na Performance: só Dono/Admin

---

## Sprint 5.5 — Relatórios, KPIs e Upsell ✅

### Entregue
- Motor `src/server/insights/` (regras determinísticas com evidência)
- Hub `/relatorios` + **Perfil** real (serviços/produtos a reoferecer)
- **Insights da semana** no Início (Dono/Recepção)
- **Sugestões no atendimento** ao abrir slot na agenda (follow-up / upsell)
- Defaults: serviço 28d (`returnAfterDays` se cadastrado), produto 60d

### Próximo
- Donna / Conversas IA consome os mesmos sinais com narrativa

---

## Sprint 5.6 — Dashboard visual gerencial ✅

### Entregue
- Hub `/relatorios` vira **painel gerencial** com gráficos (Recharts)
- Receita no tempo (área), mix de pagamento (donut), status da agenda (barras)
- Ranking top serviços e top profissionais
- Comparativo vs período anterior na receita
- Financeiro e Agendamentos também com gráfico no topo + tabela (estilo Barber, visual nosso)
- RBAC: financeiro/rankings só gestão; recepção vê agenda + insights

### Diferencial vs AppBarber
- Barber: tabelas densas, pouco visual
- Aqui: leitura rápida do negócio + drill-down tabular

---

## Sprint 5.7 — 4 gerenciais Barber + Início visual ✅

### Entregue
- Os **4 primeiros** do Barber no hub e no menu: Agendamentos, Financeiro, Comandas, **Estoque real**
- Estoque: saldo, mínimo, valor em estoque, chart por categoria, top produtos vendidos
- Comandas com gráfico de status + ticket médio
- **Comissões** no menu Relatórios + ranking visual + mix serviço/produto
- **Início** no mesmo padrão do painel: KPIs do dia/mês, gráficos, ações da semana, atalhos

### Ainda não (Barber avançado)
- Movimentação histórica de estoque (entrada/saída manual)
- Export Excel/PDF
- Auxiliar / taxas de cartão (ver Sprint 5.8)

---

## Sprint 5.8 — Vales, liquidação e fluxo ✅

### Entregue
- Tabela `staff_advances` (vale, bônus, desconto, pagamento) — criada no boot de produção
- Comissões: **a pagar líquido** = comissão − vales − descontos + bônus − pagos
- Filtro por tipo de item; só itens de **comandas fechadas**
- Lançar vale/ajuste em Comissões e botão **Vale** no Caixa (debita sessão se aberta)
- **Fluxo de caixa** `/relatorios/fluxo` (movimentado, disponível, crédito, vales, charts)
- Recepção pode ver/lançar comissões e vales

### Ainda não
- Auxiliar (2º profissional no item)
- Taxas de cartão (bruto vs líquido Barber)
- Export Excel/PDF / recibo impresso

---

## Sprint 5.9 — Filtros de ação / follow-up ✅

### Regras
| Filtro | Prazo | Lógica |
|--------|-------|--------|
| **Não retorna** | 60–100d | Sem serviço/agenda; janela saudável (não puxa sumidos antigos) |
| **Recorrência parada** | 45d | Teve serviço categoria Recorrência e não renovou |
| **Serviços a reoferecer** | 60d | Ciclo padrão; **exclui** categoria Recorrência |
| **Produtos** | 60d | Recompra |

### Entregue
- `/relatorios/perfil` vira **Ações e follow-up** com 4 abas
- Rascunho de mensagem + **Copiar** / **WhatsApp** (`wa.me`)
- Placeholder **Agendar IA** (Donna + Evolution na Sprint 6)
- Insights da semana priorizam retorno e recorrência

### Próximo (Sprint 6)
- Donna gera msg personalizada
- Fila `outreach_jobs` + n8n/Evolution envia na data
- Status na conversa

---

## Sprint 5 — Financeiro real (caixa) ✅

### Entregue
- **Abrir caixa** com fundo de troco
- **Sangria** e **suprimento** na sessão aberta
- **Fechar caixa** com contagem e saldo esperado
- Pagamento de comanda gera `cash_movement` automático se houver caixa aberto
- Visão do dia: movimentos da sessão + pagamentos por forma
- **Agenda → Abrir comanda** no detalhe do horário (espinha Barber)
- Lógica em `src/server/finance/` · RBAC `cash.write` (Dono/Recepção)

### Paridade Barber (operação do dia)
Agenda → status → comanda → itens → pagamento → caixa → fechamento

---

## Sprint 4 — Comanda ✅

### Entregue
- **+ Nova comanda** (cliente opcional via busca)
- Clique na linha abre **Drawer** com itens, pagamentos e saldo
- Adicionar **serviço** ou **produto** com profissional e desconto no item
- Comissão provisionada no item (serviço → staff default)
- Desconto na comanda
- Registrar pagamento (PIX, dinheiro, débito, crédito…)
- **Fechar** só com saldo quitado e ao menos 1 item
- **Cancelar** comanda aberta sem pagamentos
- Se vinculada a agendamento: status → em atendimento / completed
- Lógica em `src/server/orders/` · RBAC `orders.write` (Dono/Recepção)

### Próximo (Sprint 6)
- Evolution / Conversas IA operacionais
- Tenant Donna

---

## Sprint 3 — Agenda operacional ✅

### Entregue
- Grade diária por profissional (multi-tenant via sessão)
- **Agendar**: clique em célula vazia → modal (cliente, serviço, horário)
- **Bloquear**: botão direito em célula vazia → modal de bloqueio
- **Encaixe**: botão + Encaixe (permite sobreposição)
- **Detalhe**: clique no slot → status operacional (confirmar, chegou, em atendimento, finalizar)
- **Cancelamento / ausência**: só Dono, Admin e Recepção
- Barbeiro: vê só a própria coluna; pode atualizar status do próprio atendimento
- Busca de cliente no modal; duração vem do serviço
- Conflito de horário validado (exceto encaixe)
- Lógica em `src/server/agenda/`

---

### Entregue
- **+ Novo profissional** abre Drawer
- **Clique na linha** abre ficha (cadastro + jornada)
- Campos: nome, apelido, telefone, e-mail, comissão %, cor na agenda, bookable
- Aba **Jornada**: até 2 turnos por dia da semana
- Aba **Performance**: faturamento, comissão (fechada/aberta), descontos, comandas e serviços do mês
- **Taxa de cancelamento + ausência** — só para login de gestão (owner, admin, manager)
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
