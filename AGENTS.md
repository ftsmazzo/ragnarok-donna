# AGENTS.md — contexto obrigatório para qualquer agente

Antes de implementar qualquer mudança neste repositório (`ftsmazzo/ragnarok-donna` / app-barbearia), leia este arquivo.

## Objetivo do produto

Painel operacional da barbearia (Ragnarok/Donna) com paridade útil ao **AppBarber** — densidade de informação, fluxos curtos no balcão, feedback claro — sem copiar pixel a pixel nem overengineering.

**Referência recente de pacotes (cliente):** tela AppBarber `pacotesVenda` — Cliente → Pacote → Valor/Obs/Expiração → `+ Formas de Pagamento` → **Comprar/Completar** + toast “Pacote vendido com sucesso!”. Também: modal Conta Recorrência na agenda, checkout denso com split de pagamento e “Inserir no Caixa?”.

## Processo de entrega (obrigatório)

1. **Issues no GitHub** para toda tarefa, com um dos labels:
   - `tipo:correção` — bug / fluxo quebrado
   - `tipo:melhoria` — UX, densidade, polish, qualidade
   - `tipo:nova-função` — feature nova
2. **Uma Issue = um escopo claro.** Não misturar sprint inteira numa issue gigante.
3. **Trabalho em branch + Pull Request.** Não empilhar entregas grandes direto em `main` sem PR (exceto hotfix trivial acordado).
4. **Todo PR deve:**
   - mencionar a Issue (`Closes #N` ou `Refs #N`);
   - explicar o que mudou;
   - descrever como foi validado;
   - registrar riscos, limitações e próximos passos.
5. **Esteira de qualidade** (CI) deve passar antes de merge em `main` — ver `.github/workflows/ci.yml` e seção Qualidade abaixo.
6. Atualizar Issues/docs de sprint quando o escopo mudar.

Modelo de PR: `.github/PULL_REQUEST_TEMPLATE.md`.

## Motion Principles (obrigatório em UI)

Skill: [kylezantos/design-motion-principles](https://github.com/kylezantos/design-motion-principles).

**Peso neste produto (POS / SaaS operacional):** Emil (primário) → Jakub (secundário) → Jhey só em empty states/onboarding.

Regras práticas:

- Gate de frequência: interação 100×/dia → motion mínima ou nenhuma; teclado → sem animação.
- Duração típica &lt; 300ms (ideal ~180ms). Exit mais sutil que enter.
- Só `transform` / `opacity` / `filter`. Nunca animar `width`/`height`/`top`/`left`.
- Sempre `prefers-reduced-motion`.
- Evitar AI-slop: pulse infinito, scale-on-hover em tudo, stagger spam.
- Em toda superfície relevante: lazy load quando fizer sentido; skeleton no carregamento; progress em botões/ações; toast/feedback de sucesso/erro; transições consistentes em drawer/modal/lista.

Detalhes: `docs/ui/MOTION.md`.

## Densidade Barber — o que “bom” significa

- Informação útil no primeiro viewport (nome, telefone, status, valor, profissional).
- Fluxos de balcão em poucos cliques; cliente sempre “puxado” quando a operação exige.
- Feedback imediato (toast / estado do botão) — nunca silêncio após salvar/vender/pagar.
- Não confundir densidade com poluição: um job por seção; hierarquia clara.

## Arquitetura (anti-overengineering)

- Preferir estender componentes existentes (`Drawer`, `Modal`, `ClientPicker`, `OrderDrawer`) a criar paralelos.
- DRY com critério — abstração só após 2–3 usos reais.
- Separar server (`src/server`) de UI (`src/components` / `src/app`).
- Sem bottlenecks óbvios (N+1, listas sem paginação em telas quentes).

## Qualidade — backlog vs agora

**Agora (mínimo na CI):** `tsc --noEmit`, `next lint`, build quando viável.

**Backlog (abrir Issues, não instalar tudo de uma vez):**

| Área | Candidatos | Critério |
|------|------------|----------|
| Observabilidade | Sentry (1º), OpenTelemetry; Datadog/New Relic só se houver stack | Erros de produção + traces |
| Lint | ESLint atual → avaliar Biome; Commitlint; Knip | Sem guerra de tools |
| Testes | Unitários críticos → Playwright smoke; Codecov depois | Pacotes/comanda/caixa primeiro |
| Segurança/ops | Rate limit APIs, revisão segurança em PRs sensíveis, performance budget | Sem teatro |
| Jurídico | Termos / privacidade | Fora do ciclo de código até aprovação |

## Donna vs Suporte

- **Donna** = WhatsApp do cliente.
- **Suporte do painel** = FAB Central de ajuda (guias em `src/content/support`). Não misturar personas.

## Como começar uma tarefa

1. Ler Issue + este `AGENTS.md`.
2. Branch `tipo/curto-descricao` a partir de `main` atualizado.
3. Implementar o mínimo que fecha a Issue.
4. Validar (manual + CI).
5. Abrir PR com o template preenchido.
6. Só então merge / deploy via esteira do projeto.
