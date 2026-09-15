# Guia de Suporte — esqueleto e sprints

Base de conhecimento do **agente de suporte do painel** (não é a Donna do WhatsApp).

Código: `src/content/support/guides/`

## Status por guia

| Status | Significado |
|--------|-------------|
| `skeleton` | Só mapa (onde fica, aliases, notas). Sem passos. |
| `draft` | Passos e objeções escritos; falta validar no produto. |
| `ready` | Validado no código/UI — agente responde com confiança. |

Hoje: **30/30 `ready`**; wiring **S9** em produção. Ondas de aprofundamento: filtro por papel + guias densos (Agenda, Equipe, Conversas).

## Como enriquecer (manutenção)

1. Ao mudar tela/fluxo no produto, atualizar o guia correspondente.
2. Manter `steps[]` e `objections[]` alinhados à UI real.
3. Ajustar `roles` se barbeiro/recepção vê diferente.
4. `lastVerified` = data da conferência; status `ready` (ou `draft` se incerto).
5. Agente consome `draft`|`ready` via `search_guides` / `get_guide`. FAQ é fallback.

## Fila de sprints (histórico)

| Sprint | Guias | Status |
|--------|-------|--------|
| **S1** | `comandas`, `comandas-historico` | **ready** |
| **S2** | `pacotes`, `consumo-pwa` | **ready** |
| **S3** | `agenda`, `lista-espera` | **ready** |
| **S4** | `caixa`, `comissoes` | **ready** |
| **S5** | `clientes`, `profissionais`, `servicos`, `produtos` | **ready** |
| **S6** | Relatórios (`relatorios-*`, `alertas`, `fluxo-caixa`, `contas`) | **ready** |
| **S7** | `conversas-ia`, `agente-donna`, `disparos`, `pwa-app` | **ready** |
| **S8** | `empresa`, `equipe-acesso`, `minha-conta`, `inicio` | **ready** |
| **S9** | Wiring do agente (tools + prompt + deep-link `href`) | **feito** |

### S9 — runtime

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

`faq.ts` e `nav-hints.ts` permanecem como fallback e atalhos de “onde fica”. O guia `ready` é a fonte preferida do agente.
