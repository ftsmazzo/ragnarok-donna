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
- Agendamentos — período, status, cliente, profissional; chart + tabela
- Gerencial Financeiro — receita no tempo, mix de pagamento, caixa
- Gerencial Comandas, Estoque, Perfil (recompra)

Telas de listagem/agenda ainda usam **mock**; dados reais após seed + import AppBarber.

```bash
npm run dev
# http://localhost:3000 → /agenda
```
