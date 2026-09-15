# Motion UI — app-barbearia

Fonte: [design-motion-principles](https://github.com/kylezantos/design-motion-principles) (Emil / Jakub / Jhey).

## Peso do projeto

| Primário | Secundário | Seletivo |
|----------|------------|----------|
| Emil (POS, balcão, produtividade) | Jakub (polish de produção) | Jhey (empty states / onboarding) |

## Checklist por PR de UI

- [ ] Frequency gate aplicado (não animar o que a recepção dispara o dia inteiro)
- [ ] Enter/exit em drawer, modal, toast (&lt; 300ms; exit mais curto)
- [ ] Botões com estado `pending` / progress visual
- [ ] Skeleton ou placeholder em listas/drawers que buscam dados
- [ ] Toast ou feedback inline em sucesso/erro (ex.: venda de pacote)
- [ ] `prefers-reduced-motion: reduce` desliga ou reduz motion
- [ ] Sem pulse infinito / scale hover genérico / stagger longo

## Tokens sugeridos (CSS)

Usar variáveis em `globals.css` (criar se ainda não existirem):

```css
:root {
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 280ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Superfícies prioritárias

1. Venda de pacote / comanda / caixa (toasts + pending)
2. Agenda (transições de drawer, sem animar scroll da grade)
3. Cadastros (skeleton de tabela)
4. Suporte chat (já tem painel; respeitar reduced-motion)
