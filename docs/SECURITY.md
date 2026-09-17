# Segurança — APIs sensíveis

Checklist rápido para PRs que tocam auth, pagamentos, webhooks ou tokens.

## Antes do merge

- [ ] Rota exige auth (sessão, Bearer service token, ou secret de cron)
- [ ] Rate limit em superfície pública / brute-force (ver `src/server/security/rate-limit.ts`)
- [ ] Sem logar senha, token, cookie de sessão ou payload completo de cartão
- [ ] Input validado (tamanho, formato); erros genéricos ao cliente
- [ ] Capacidades (`hasCapability`) alinhadas ao papel — barbeiro não vira owner por engano

## Limites atuais (por IP / processo)

| Escopo | Limite | Janela |
|--------|--------|--------|
| `auth.login` | 12 | 15 min |
| `auth.change-password` | 8 | 15 min |
| `agent.webhook` | 180 | 1 min |
| `agent.orchestrate` | 90 | 1 min |
| `ops.outreach-tick` | 30 | 1 min |

Em multi-réplica o teto é por instância (memória local). Redis compartilhado fica para follow-up se necessário.
