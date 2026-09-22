# Donna — Agente Operacional (WhatsApp)

**Doc vivo do cérebro.** Qualquer mudança em `src/server/agent/**` deve manter este arquivo coerente.

Persona por unidade (`Donna`, `Pati`, …). **Mesmo motor** multi-tenant.  
Tools usam Drizzle via wrappers `*ForAgent` — nunca SQL cru no n8n/MCP.

**Não confundir:**

| Canal | Público | Código |
|-------|---------|--------|
| **Donna (WhatsApp)** | Cliente final | `src/server/agent/**` |
| **Suporte do painel** | Dono/recepção | `src/server/support/**` + FAB |
| Tenant “Donna Elegant” | Import de salão | `data/donna-elegant-export/` — não é o motor |

## Runtime

```
WhatsApp → Evolution API
  → POST /api/agent/webhook  (200 imediato; after())
  → inbound.ts processInboundMessage
  → orchestrator.ts runOrchestrator
  → short-circuits (obrigado / espera) OU loop LLM (max 6 tools, ~50s)
  → executeTool → domain-agenda | domain-waitlist | domain-orders
  → deliverWhatsAppText → Evolution
  → painel /conversas (mode ai|human)
```

| Entrada | Arquivo |
|---------|---------|
| Webhook Evolution | `src/app/api/agent/webhook/route.ts` |
| Orquestrar (serviço) | `src/app/api/agent/orchestrate/route.ts` (`AGENT_SERVICE_TOKEN`) |
| Catálogo | `src/app/api/agent/catalog/route.ts` |
| Config UI | `/configuracoes/agente` |
| Inbox | `/conversas` + PWA `/pwa/conversas` |

LLM: Haiku primary → Sonnet fallback (`llm.ts`). Memória: últimas **12** mensagens.

## Camadas

| Camada | Onde | Papel |
|-------|------|--------|
| Persona | `persona/defaults.ts` + `agent_profiles.persona` | Tom, fluxos; `systemPrompt` **compilado** |
| Regras fortes | `orchestrator.ts` → `runtimeRules()` | Datas, espera, handoff, comprimento |
| Skills | `skills.ts` → `SKILL_PLAYBOOKS` | Playbooks schedule/order/followup/handoff |
| Tools | `catalog.ts` / `tools.ts` (**18**) | Agenda, espera, cliente, comanda, handoff, remarcação |
| Domínio | `domain-agenda.ts`, `domain-waitlist.ts`, `domain-orders.ts` | Slots 30min, almoço 12–14, waitlist |
| Auditoria | `agent_tool_calls` | Toda tool |

## Tools (canônicas)

Fonte: `AGENT_TOOL_NAMES` em `src/server/agent/types.ts`.

| Tool | Efeito |
|------|--------|
| `get_unit_context` | Tenant, staff bookable, perfil da loja |
| `find_client` | Cliente por telefone; histórico; `serviceQuery` |
| `list_services` | Serviços ativos bookable |
| `list_products` | Produtos à venda |
| `list_client_appointments` | Agendas (today/week/upcoming/next/all) |
| `resolve_date` | Frase → YYYY-MM-DD + weekday SP |
| `list_slots` | Livres; preferredHour; alternatives; staffDayFull |
| `book_appointment` | Cria appointment `source: whatsapp_ai` |
| `cancel_appointment` | Cancela + pode promover waitlist |
| `reschedule_appointment` | Remarcação atômica (book novo + cancel antigo) |
| `add_to_waitlist` | Upsert espera |
| `list_waitlist` | Consulta waiting/notified |
| `open_order` / `add_order_item` / `list_open_orders` | Comanda |
| `list_followups` | Retorno inativo |
| `send_whatsapp` | Envio Evolution |
| `handoff_human` | `mode=human` + alerta |

## Skills

| Skill | Objetivo |
|-------|----------|
| `skill.schedule` | Agendar, remarcar, cancelar, espera, datas |
| `skill.order` | Produtos / comanda |
| `skill.followup` | Convite retorno |
| `skill.handoff` | Recepção assume |

## Tom e cadência

- Traits default: caloroso, direto, ágil, atencioso (`persona/defaults.ts`)
- Comprimento: **curta** (1–2 frases); sem markdown; nunca dizer que é IA/bot
- Cadência agenda: serviço → data (`resolve_date`) → slots → **confirmar uma vez** → book
- Pós-book: “obrigado” / “ok” → short-circuit, **não** reconfirma
- Check-in (“cheguei”) ≠ encaixe; encaixe imediato = recepção

## Short-circuits (sem LLM)

Em `orchestrator.ts`, antes do loop:

1. **Obrigado pós-booking** — reply curto
2. **Oferta de espera** — após recusa suave das alternativas
3. **Aceite de espera** — `add_to_waitlist` direto
4. **“Estou na lista?”** — `list_waitlist` filtrado por telefone
5. **Handoff forçado no fluxo de espera** — redirecionado para `add_to_waitlist`

## Contratos de fluxo

**Agendar:** `find_client` → `list_services` → `resolve_date` → `list_slots` → confirma → `book_appointment`

**Remarcar:** `reschedule_appointment` (preferido) — evita buraco cancel-then-book

**Horário ocupado:** 2–3 `alternatives` → se recusar → oferecer espera → `add_to_waitlist`

**Cancelar:** `list_client_appointments` → `cancel_appointment` → pode avisar espera

## Config por tenant

`agent_profiles`: `displayName`, `persona`, `systemPrompt`, `toolsEnabled`, `model`, `meta.handoffNotifyPhoneE164`  
WhatsApp: `whatsapp_connections` · Conversas: `conversations` / `messages`  
Business facts: `tenants.settings` via `business-profile.ts`

## Critério premium (aceitação)

- Zero inventário de horário ou dia da semana
- Waitlist sempre confirma (ou erro explícito) — nunca silêncio
- Remarcação sem cancelar e ficar sem horário
- Tom curto e humano
- Eval harness verde (`scripts/eval-agent-brain.mjs`)

## Observabilidade

- `agent_tool_calls` por conversa
- Ops: `GET /api/agent/ops/llm-stats` (uso + falhas de tools + handoff/waitlist)
- Inbox: `/conversas`

## Sprint 6 (status)

| Fase | Status |
|------|--------|
| 6.0–6.3 scaffold + webhook + tools domínio | ✅ |
| Cérebro: doc + eval + remarcação atômica + prompts | em curso |
| 6.4 Follow-up conversacional completo | backlog |
| 6.5 MCP bridge | backlog |

## Segurança

- Webhook: `AGENT_WEBHOOK_SECRET` (não reutilizar apikey Evolution como secret)
- APIs de serviço: `AGENT_SERVICE_TOKEN`
- Handoff: IA para de responder até humano devolver (`mode=human`)

## Disparos (outreach) ≠ conversa reativa

Campanhas / confirmação D+1 / follow-up inativo moram em `src/server/outreach/**` (fila + pacing anti-ban).  
A Donna reativa (webhook → orchestrator) **não** envia blast. Ver [`docs/Demandas/DISPAROS.md`](Demandas/DISPAROS.md) antes de ligar `OUTREACH_DISPATCH_ENABLED`.
