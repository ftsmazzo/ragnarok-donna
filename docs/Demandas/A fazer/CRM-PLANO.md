# Plano CRM — dentro do painel Ragnarok

CRM **não** é app separado. Vive no mesmo Next.js (`/crm`, ficha em Clientes, Lembretes, Conversas IA).

## Entregas (1 Issue = 1 PR)

| # | Issue | Escopo | Validação |
|---|-------|--------|-----------|
| 1 | Origem + ficha + lead Zap | Canais/campanha na ficha; lead no 1º WhatsApp; status lead/cliente | Manual ficha + conversa nova; tsc |
| 2 | Funil | Etapas/saídas na ficha + lista `/crm` por etapa | Mudar etapa; filtrar; tsc |
| 3 | Frequência + lista retorno | Motor histórico; tela CRM “hora de voltar”; cards Lembretes | Lista + alerta; tsc |
| 4 | Assinatura mensal (base) | Modelo + cadastro/venda mínima (sem Stripe cliente ainda) | Criar/ver assinatura; tsc |

Painel dono / disparos = follow-up após #3–4.

## Regras

- Branch `nova-funcao/crm-…` a partir de `main`
- CI Quality passa → squash-merge → deploy EasyPanel
- Não misturar escopos num PR só
- Estender `clients.preferences` + UI existente antes de tabelas novas (exceto assinatura)
