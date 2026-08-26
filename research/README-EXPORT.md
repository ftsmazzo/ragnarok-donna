# Exportação AppBarber (migração)

Script: `export-appbarber.mjs`  
Descoberta de API: `discover-api.mjs`

## Uso

```powershell
cd research
$env:APPBARBER_EMAIL="email@da-barbearia"
$env:APPBARBER_PASS="senha"
$env:APPBARBER_AGENDA_DAYS_BACK="730" # 24 meses (padrão no script)
$env:APPBARBER_AGENDA_DAYS_FWD="60"
$env:APPBARBER_ITEM_CONCURRENCY="8"    # paralelismo dos itens de comanda
node export-appbarber.mjs
```

Saída em `export/<timestamp>/` (JSON + CSV).

## O que sai

| Arquivo | Conteúdo |
|---------|----------|
| `clientes` | Cadastro completo (DataTables) |
| `clientes-removidos` | Inativos/removidos |
| `profissionais` | Barbeiros/equipe |
| `servicos` | Preço, duração, comissão |
| `produtos` | Estoque |
| `pacotes` | Pacotes de serviços |
| `jornadas` | Horários semanais |
| `agenda` | Slots no intervalo pedido |
| `comandas-historico` | Cabeçalho da comanda (total, pagamento, cliente) |
| `comanda-itens` | **Linhas de consumo** (serviço/produto, qtd, valor, profissional) |
| `manifest.json` | Contagens e metadados |

## Relação de consumo

`cliente ← comanda ← comanda-itens`  
A agenda aponta `Com_Codigo` / `codCliente` / `sercodigo` e ajuda a reconciliar, mas o consumo faturado está na comanda + itens.

## Fora do export (ainda)

Fotos S3, extrato detalhado de pontos/fidelidade, tags, anamnese, documentos, NF, caixa diário bruto, lista de espera histórica, notícias, assinaturas (módulo comercial).

## Como funciona

Não é HTML scrape cego. O painel chama endpoints PHP autenticados por cookie de sessão (`pages/cadastros/busca*.php`, `pages/actions/buscaAgenda3.php`). O exportador faz login, reutiliza a sessão e pagina as listas.

## Dados sensíveis

Pastas `export/` e `api-discovery/` contêm PII (nome, telefone, e-mail). Não versionar. Trocar senha se foi compartilhada em chat.
