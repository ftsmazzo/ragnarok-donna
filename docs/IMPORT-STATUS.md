# Import AppBarber / AppBeleza — status

**Último sync completo:** 2026-09-20 (go-live segunda)

## RagnaroK's (`ragnaroks`) ← AppBarber

| Campo | Valor |
|-------|--------|
| Export | `research/export/2026-09-20T18-19-21` |
| Import run | `2026-09-20T18-19-21` (completed) |

| Entidade | Export | Import |
|----------|--------|--------|
| Profissionais | 5 | 5 |
| Serviços | 37 | 37 |
| Produtos | 63 | 63 |
| Pacotes | 32 | 32 |
| **Carteiras pacote (créditos)** | 410 ativos no AppBarber | **409** importadas (#123) — 132 ativas / 283 expiradas; 656 usos restantes |
| Clientes (+ removidos) | 4867+222 | 5088 |
| Agenda (24m+90d) | 35.890 | 35.890 |
| Comandas | 31.418 | 31.418 |
| Itens | 58.011 | 58.011 |
| Pagamentos | — | 22.279 |
| Lista de espera | (extras 13/09) | 49 |

Registros criados só no painel (sem `external_id` AppBarber) **permanecem**.

## Donna Elegant (`donna-elegant`) ← AppBeleza

| Campo | Valor |
|-------|--------|
| Export | `research/export/2026-09-20T18-29-22` |
| Import run | `2026-09-20T18-29-22` (completed) |
| Onboard | unidade-01 + unidade-02 |

| Entidade | Export | Import |
|----------|--------|--------|
| Profissionais | 12 | 12 |
| Serviços | 68 | 68 |
| Produtos | 61 | 61 |
| Pacotes | 23 | 23 |
| Clientes | 1944+1 | 1945 |
| Agenda | 8.601 | 8.601 |
| Comandas | 16.243 | 16.243 |
| Itens | 23.660 | 23.660 |
| Pagamentos | — | 12.726 |

## Como repetir

```powershell
# 1) Export
cd research
$env:APPBARBER_EMAIL="..."; $env:APPBARBER_PASS="..."
node export-appbarber.mjs

# Donna (limpar APPBARBER_* antes)
Remove-Item Env:APPBARBER_EMAIL, Env:APPBARBER_PASS -ErrorAction SilentlyContinue
$env:APPBELEZA_EMAIL="..."; $env:APPBELEZA_PASS="..."
$env:APPBELEZA_BASE_URL="https://sistema.appbeleza.com.br"
node export-appbarber.mjs

# 2) Import
cd ..
# DATABASE_URL no .env
node scripts/import-appbarber.mjs --dir research/export/<stamp> --tenant ragnaroks
node scripts/import-appbarber.mjs --dir research/export/<stamp> --tenant donna-elegant --source appbeleza --name "Donna Elegant"
node scripts/onboard-donna-elegant.mjs --dir research/export/<stamp> --skip-import
```

Upsert por `(tenant_id, external_source, external_id)`.
