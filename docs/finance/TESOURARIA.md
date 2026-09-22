# Tesouraria — domínio financeiro (módulo separado do Caixa POS)

> Spec Onda 0 · Issues #154–#160 · Fonte: `docs/Demandas/DFC - DONNA ELEGANTE.xlsx`

## Fronteira

| Mundo | O que é | Onde |
|-------|---------|------|
| **Caixa POS** | Responsabilidade do turno (gaveta, sangria, fechamento) | `/caixa`, `cash_sessions` / `cash_movements` |
| **Tesouraria** | Competência + liquidação bancária (AP/AR, plano, FCM/DRE) | `/financeiro/*`, tabelas `chart_*` / `finance_*` |

**Nunca** misturar fechamento de caixa do turno com extrato bancário. A ponte POS → tesouraria (Onda 5) é opcional, idempotente e configurável.

## Evento financeiro canônico (`finance_entries`)

Espelha a aba `base_de_dados`:

| Campo | Origem planilha | Notas |
|-------|-----------------|-------|
| `direction` | C/D | `credit` (receita/entrada) · `debit` (despesa/saída) |
| `description` | DESCRIÇÃO | Obrigatório |
| `partyName` | CLIENTE/FORNECEDOR | Texto livre (Onda 1); vínculo cliente opcional depois |
| `chartAccountId` | APR / conta analítica | FK `chart_accounts` |
| `costCenter` | CENTRO DE CUSTO | Texto |
| `treasuryPaymentMethodId` | MEIO | Tabela editável (≠ `payment_method` do POS) |
| `docType` / `docNumber` | TIPO / Nº DOC | |
| `issueDate` | DATA EMISSÃO | Competência (DRE) |
| `dueDate` | DATA VCTO | Caixa previsto (FCM/FCD) |
| `settledAt` | DATA BAIXA | Liquidação |
| `bankAccountId` | CÓD. BANCO / instituição | FK `bank_accounts` |
| `forecastCents` / `budgetCents` / `actualCents` | FORECAST / BUDGET / REALIZADO | Três colunas de valor |
| `installmentIndex` / `installmentTotal` | PARCELAS | Ex.: 2/12 |
| `recurrence` | — | `none` · `weekly` · `biweekly` · `monthly` · `bimonthly` |
| `branchId` | RESPONSÁVEL / unidade | Donna I / II |
| `creditCardId` / `cardInvoiceId` | — | Onda 2 |

Valor “operacional” do título: `actualCents` se baixado; senão `forecastCents` (ou `budgetCents` se forecast vazio).

## Situação (calculada, não só digitada)

A partir de `dueDate`, `settledAt` e **hoje** (America/Sao_Paulo):

| Situação | Regra |
|----------|--------|
| `settled` | `settledAt` preenchido |
| `overdue` | sem baixa e `dueDate` &lt; hoje |
| `this_week` | sem baixa e vencimento nos próximos 7 dias |
| `open` | sem baixa e vencimento depois da semana |
| `forecast` | marcado como previsto sem valor realizado e sem baixa |

Flags auxiliares: `isForecastOnly` (só forecast, sem actual).

## Plano de contas (`chart_accounts`)

Hierarquia APR (código numérico string, ex. `111`, `121`):

- `code`, `name` (analítica)
- `syntheticName` (grupo sintético)
- `dfcGroup1` / `dfcGroup2` — mapeamento fluxo de caixa
- `dreGroup1` / `dreGroup2` — mapeamento DRE
- `includeInFcd` / `includeInFcm`
- `active`, `tenantId`

Seed: `src/server/treasury/seed/plano_de_contas_donna.json` (210 contas da Donna).

## Contas bancárias e cartões

- `bank_accounts`: instituição, tipo (corrente/poupança/caixa interno), saldo inicial + data, `branchId` opcional.
- `credit_cards` (Onda 2): limite, dia vencimento fatura, ciclo aberto.
- Extrato: visão dos `finance_entries` filtrados por banco + marcação de conciliação (`reconciledAt`).

## Relatórios

- **FCD**: diário do mês — entradas/saídas por `dueDate` ou `settledAt` (modo previsto × realizado).
- **FCM**: 12 meses — agregado mensal forecast × budget × actual.
- **DRE**: por competência (`issueDate`) agrupando `dreGroup1` / `dreGroup2`.

## Calculadoras (Onda 4)

- Capital de giro: inputs estoque, prazos recebimento/pagamento, despesas fixas → CG projetado (regras do `.xlsm`).
- Ponto de equilíbrio: econômico / contábil a partir de receitas e custos fixos/variáveis.

## Ponte POS (Onda 5)

1. Ao registrar `payment` (ou fechar comanda), se config `treasuryBridgeEnabled` e método mapeado:
2. Criar `finance_entries` + `finance_entry_links.paymentId` **único** (unique index).
3. Não alterar `cash_sessions` / `cash_movements`.

## Permissões

- `finance.treasury` — leitura/escrita tesouraria (owner/admin; manager leitura).
- Independente de `cash.write`.

## Seed / importador

Server action `seedTreasuryFromDonnaSample`:

1. Upsert plano de contas por `code`.
2. Garante meios e bancos básicos.
3. Importa amostra de `base_de_dados_amostra.json` (idempotente por `externalId` = hash da linha).

## Deploy / schema

Após merge, rodar no ambiente com `DATABASE_URL` acessível:

```bash
npm run db:push
```

SQL de referência (só tesouraria): `drizzle/treasury_module.sql`.

Na home `/financeiro`, owner/admin pode **Importar plano Donna + amostra** (idempotente) e ligar a **Ponte POS** (default off).
