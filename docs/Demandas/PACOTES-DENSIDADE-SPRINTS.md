# Pacotes — densidade AppBarber (sprints)

**Vídeo cliente:** `docs/Demandas/WhatsApp Video 2026-09-15 at 14.45.15.mp4`  
**URL referência:** `…/pacotesVenda` + agenda + checkout.

## Gap vs hoje

| AppBarber | Nosso app (após fix vincular cliente) |
|-----------|----------------------------------------|
| Tela dedicada Cliente + Pacote + Valor/Obs/Expiração | Venda embutida no Tipo da comanda / ficha |
| `+ Formas de Pagamento` na venda do pacote | Pagamento só no fluxo geral da comanda |
| Botão **Comprar** / **Completar** | “Vender pacote / gerar carteira” |
| Toast “Pacote vendido com sucesso!” | Feedback fraco/silencioso |
| Conta Recorrência na agenda (selecionar pacote) | Crédito via checkbox/Usar na comanda |
| Checkout denso (bandeira, inserir caixa, parcelado) | Pagar na comanda (mais enxuto) |

## Sprints

### S1 — Fluxo venda densificado (P0)
1. Tela/modal **Venda de pacote** (cliente obrigatório, pacote, valor, obs, expiração preview, itens inclusos).
2. Pagamento na venda (reusar métodos da comanda) + fechar/liberar carteira.
3. Toast sucesso/erro (motion Emil).
4. Skeleton + pending no botão Comprar.

### S2 — Agenda ↔ pacote (P0/P1)
1. Atalho na agenda/detalhe: aplicar crédito / Conta Recorrência (selecionar pacote do cliente).
2. Feedback “Detalhes do Pacote inseridos…” ao lançar na comanda.

### S3 — Checkout densidade (P1)
1. Polish pagar/fechar: resumo lateral, multi-pagamento claro, opção explícita caixa.
2. Motion/skeleton nas listas de itens/pagamentos.

### S4 — Catálogo + permissões (P1)
1. Layout cadastro pacote (itens legíveis).
2. Recepção enxerga o necessário pós-import (vínculo serviço).

### S5 — Qualidade esteira (paralelo)
Ver Issues `sprint:qualidade` — CI, motion tokens, Playwright smoke da venda de pacote.

## Issues (GitHub)

| # | Título | Tipo |
|---|--------|------|
| [#1](https://github.com/ftsmazzo/ragnarok-donna/issues/1) | Tela/modal Venda de pacote | Nova função |
| [#2](https://github.com/ftsmazzo/ragnarok-donna/issues/2) | Pagamento na venda do pacote | Melhoria |
| [#3](https://github.com/ftsmazzo/ragnarok-donna/issues/3) | Toast feedback pacote | Melhoria |
| [#4](https://github.com/ftsmazzo/ragnarok-donna/issues/4) | Conta Recorrência na Agenda | Nova função |
| [#5](https://github.com/ftsmazzo/ragnarok-donna/issues/5) | Checkout densidade | Melhoria |
| [#6](https://github.com/ftsmazzo/ragnarok-donna/issues/6) | Densidade cards Agenda | Melhoria |
| [#7](https://github.com/ftsmazzo/ragnarok-donna/issues/7) | Empty state pacotes importados | Correção |
| [#8](https://github.com/ftsmazzo/ragnarok-donna/issues/8) | Skeleton + pending | Melhoria |
| [#9](https://github.com/ftsmazzo/ragnarok-donna/issues/9) | CI gate tsc+lint | Nova função |
| [#10](https://github.com/ftsmazzo/ragnarok-donna/issues/10) | Playwright smoke pacote | Melhoria |
| [#11](https://github.com/ftsmazzo/ragnarok-donna/issues/11) | Sentry | Nova função |
| [#12](https://github.com/ftsmazzo/ragnarok-donna/issues/12) | Rate limit + segurança | Melhoria |

Ordem sugerida: **#9 → #1+#3 → #2 → #7 → #8 → #4 → #5 → #6 → #10…**
