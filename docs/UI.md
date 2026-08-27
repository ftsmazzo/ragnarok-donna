# UI — shell operacional (AdminLTE / AppBarber)

O painel replica a **gramática visual** do AppBarber para facilitar a migração de RagnaroK e Donna:

| Elemento | Referência |
|----------|------------|
| Header | Laranja `#f39c12` |
| Sidebar | Cinza `#222D32` (AdminLTE) |
| Fundo | `#f2f2f2` |
| Fonte | Quicksand |
| Slots agenda | Roxo / teal (bloqueio) |

Menu principal: Agenda → Cadastros → Comandas → Financeiro → **Relatórios** → Conversas IA → Config.

Relatórios (espelho AppBarber + diferencial nosso):
- **Painel gerencial** `/relatorios` — KPIs + gráficos dinâmicos + ações da semana
- **1 Agendamentos** — chart + tabela por status
- **2 Financeiro** — receita no tempo, mix de pagamento
- **3 Comandas** — ticket, volume, status
- **4 Estoque** — saldo, mínimo, vendas de produto
- Perfil (recompra) + **Comissões** (ranking + analítico)
- **Início** — mesmo visual do painel (dia + mês + ações)

Telas de listagem/agenda ainda usam **mock**; dados reais após seed + import AppBarber.

```bash
npm run dev
# http://localhost:3000 → /agenda
```
