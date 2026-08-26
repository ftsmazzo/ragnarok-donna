# De-para AppBarber → nosso schema

Fonte: export `research/export/<timestamp>/`  
Todas as entidades importadas com `external_source = 'appbarber'`.

## Cadastros

| Arquivo AppBarber | Campo origem | Tabela destino | Campo / regra |
|-------------------|--------------|----------------|---------------|
| `clientes.json` | `Codigo` | `clients` | `external_id`; `Nome`→`name`; `Celular`→`phone` + normalizar `phone_e164`; `Pontos`→`loyalty_points`; `Obs`→`notes` |
| `profissionais.json` | `Pes_Codigo` | `staff` | `external_id`; `Pes_Nome`→`name`; `Pes_Apelido`→`nickname`; e-mail/celular; `PAF_Gestor`→meta |
| `servicos.json` | `Ser_Codigo` | `services` | `external_id`; `Ser_Descricao`→`name`; `Ser_Intervalo_Padrao`→`duration_min`; `Ser_Valor`→`price_cents`; `Ser_Comissao` `"40.00%"`→`commission_bps` 4000; `TCa_Descricao`→categoria |
| `produtos.json` | `Codigo` | `products` | `external_id`; descrição, saldo→`stock_qty`, valor→`price_cents` |
| `pacotes.json` | `Codigo` | `packages` | `external_id`; `ValorTotal`→`price_cents`; itens depois se API detalhar |
| `jornadas.json` | `Pes_Codigo`+`PJo_Dia` | `staff_schedules` | weekday; `PJo_Hor_Ini1/Fim1`→slot 1 (e 2/3) |

## Operação

| Arquivo | Campo origem | Destino | Regra |
|---------|--------------|---------|--------|
| `agenda.json` | `id` | `appointments.external_id` | `start`/`end`→`starts_at`/`ends_at`; `codCliente`→lookup client; `resources`→staff; `sercodigo`→service; status map; `obs`→`notes`; `Com_Codigo`→ligar order depois; `valor`→`price_cents` |
| `comandas-historico.json` | `Codigo` | `orders.external_id` | `CodigoCliente`→client; `Status` Fechada→`closed`; `Valor`→`total_cents`; datas opened/closed; `TipoPagamento`→`payments` |
| `comanda-itens.json` | `CodItem` | `order_items.external_id` | `Codigo`→order; `TipoItem` 1→service / 2→product; `CodSerPro`→service/product; `Item`→`description`; qtd/valores; `Profissional_Codigo`→staff |

### Status agenda (AppBarber → enum)

| AppBarber | Nosso |
|-----------|--------|
| Agendado | `scheduled` |
| Confirmado | `confirmed` |
| Realizado | `completed` |
| Ausência / Ausente | `no_show` |
| Cancelado | `cancelled` |
| Bloqueado | `blocked` |

### Pagamento

| AppBarber | Nosso |
|-----------|--------|
| Dinheiro | `cash` |
| Pix | `pix` |
| Cartão de Débito | `debit` |
| Cartão de Crédito | `credit` |
| (outros) | `other` |

## Ordem de import (obrigatória)

1. `tenants` (criar RagnaroK's)
2. `staff` → `services` / categories → `products` → `packages`
3. `staff_schedules`
4. `clients`
5. `appointments`
6. `orders` → `order_items` → `payments`
7. Registrar `import_runs.stats`

## Idempotência

```sql
UNIQUE (tenant_id, external_source, external_id)
```

Re-rodar o import atualiza (upsert) sem duplicar.

## Fora do 1º import (backlog)

- Fotos S3, tags, extrato fino de pontos, anamnese, NF, caixa sessão a sessão, espera histórica, notícias
