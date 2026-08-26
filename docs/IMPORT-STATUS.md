# Import AppBarber — status

**Tenant:** `ragnaroks` (RagnaroK's Barbearia)  
**Export:** `research/export/2026-08-26T14-56-45` (+ extras `2026-08-26T15-15-09-extras`)  
**Script:** `npm run import:appbarber`

## Importado (2026-08-26)

| Entidade | Qtd export | Qtd banco |
|----------|------------|-----------|
| Profissionais | 5 | 5 |
| Serviços | 37 | 37 |
| Produtos | 63 | 63 |
| Pacotes (+ itens JSON) | 32 | 32 |
| Jornadas | 23 → 46 slots | 46 |
| Clientes (+ removidos) | 4828 + 221 | **5049** |
| Agenda | 34.828 | 34.828 |
| Comandas | 31.272 | 31.272 |
| Itens de comanda | 57.546 | 57.546 |
| Pagamentos (comandas fechadas) | — | 22.195 |
| Lista de espera (extras) | 49 | 49 |

Re-import idempotente: `external_source = appbarber` + upsert.

## Backlog (no menu, ainda sem dados)

| Módulo AppBarber | Export extras | Prioridade |
|-----------------|---------------|------------|
| Clube / assinaturas | clube (1), clube-servicos (2) | média |
| Tags de cliente | vazio | baixa |
| Anamnese | vazio | baixa |
| Notícias | vazio | baixa |
| Caixa (sessões/movimentos) | caixas falhou API | alta |
| Extrato fidelidade / pontos | só saldo em clientes | média |
| Fotos S3 (avatars) | URLs nos cadastros | baixa |
| Rodízio, mensagens, pesquisa | não exportado | média |
| NF / documentos | não exportado | baixa |

## Próximo passo

1. Ligar telas (Agenda, Clientes, Relatórios) aos dados reais do Postgres  
2. Importar **Donna** como segundo tenant quando houver export  
3. Caixa + comissões com dados derivados de `orders` / `payments`
