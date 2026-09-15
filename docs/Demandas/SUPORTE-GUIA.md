# Guia de Suporte — esqueleto e sprints

Base de conhecimento do **agente de suporte do painel** (não é a Donna do WhatsApp).

Código: `src/content/support/guides/`

## Status por guia

| Status | Significado |
|--------|-------------|
| `skeleton` | Só mapa (onde fica, aliases, notas). Sem passos. |
| `draft` | Passos e objeções escritos; falta validar no produto. |
| `ready` | Validado — agente pode responder com confiança. |

Hoje: **S1–S8** em `draft`; **S9** wiring feito (agente usa `draft`+`ready`). Validar na loja → promover a `ready`.

## Como enriquecer (por sprint)

1. Escolher 1–2 guias da fila abaixo.
2. Preencher `steps[]` (passo a passo real da UI).
3. Preencher `objections[]` (“não acho”, “não deixa fechar”, permissão…).
4. Ajustar `roles` se barbeiro/recepção vê diferente.
5. `status: "draft"` → validar na loja → `status: "ready"` + `lastVerified`.
6. Agente já consome `draft`|`ready` via `search_guides` / `get_guide` (S9). FAQ continua como fallback.

## Fila sugerida de sprints

| Sprint | Guias | Status |
|--------|-------|--------|
| **S1** | `comandas`, `comandas-historico` | **draft** (tip reabrir corrigido no nav-hints) |
| **S2** | `pacotes`, `consumo-pwa` | **draft** (uso interno esclarecido → Produtos) |
| **S3** | `agenda`, `lista-espera` | **draft** (espera = só Donna; painel consulta) |
| **S4** | `caixa`, `comissoes` | **draft** |
| **S5** | `clientes`, `profissionais`, `servicos`, `produtos` | **draft** |
| **S6** | Relatórios (`relatorios-*`, `alertas`, `fluxo-caixa`, `contas`) | **draft** |
| **S7** | `conversas-ia`, `agente-donna`, `disparos`, `pwa-app` | **draft** |
| **S8** | `empresa`, `equipe-acesso`, `minha-conta`, `inicio` | **draft** |
| **S9** | Wiring do agente (tools + prompt + deep-link `href`) | **feito** |

### S9 — o que entrou no runtime

- Tools: `search_guides`, `get_guide` (preferidos); `search_help` / `get_feature_hint` fallback.
- Prompt: ordem guia → FAQ; citar `menuPath` + `href`.
- Chat: rotas `/…` nas respostas viram link clicável.
- Offline (sem LLM): responde pelo guia se houver hit.

## Regras de conteúdo

- Nunca inventar tela/botão.
- Sempre `menuPath` + `href` canônicos (iguais ao `nav.ts`).
- Separar **Suporte do painel** de **Donna no WhatsApp do cliente**.
- Objeções em linguagem da recepção, não jargão de dev.

## FAQ legado

`faq.ts` e `nav-hints.ts` continuam até os guias `ready` substituírem. Na S1, corrigir o tip “comanda fechada não reabre” em `nav-hints`.
