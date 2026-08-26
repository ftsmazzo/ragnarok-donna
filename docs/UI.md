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

Relatórios (espelho AppBarber, prioridade do cliente RagnaroK):
- Agendamentos — período, status, cliente, profissional; export Excel/PDF
- Gerencial Financeiro — dashboard receitas/despesas, caixa
- Gerencial Comandas, Estoque, Perfil

Telas de listagem/agenda ainda usam **mock**; dados reais após seed + import AppBarber.

```bash
npm run dev
# http://localhost:3000 → /agenda
```
