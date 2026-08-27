# Donna — Orquestrador multi-tenant (Sprint 6)

Persona por unidade (Donna, Pati, …). **Mesmo motor** em todas as barbearias.  
Tools batem em `server/agenda|orders|clients|insights` — nunca SQL cru no n8n/MCP.

## Mapa em camadas

```
WhatsApp (Evolution)
        ↓
  Orquestrador  (src/server/agent)
        ↓
  Persona       agent_profiles (nome, prompt, toolsEnabled)
        ↓
  Skills        playbooks versionados (agendar, comanda, follow-up, handoff)
        ↓
  Tools         funções tipadas + auditoria agent_tool_calls
        ↓
  Domínio       appointments / orders / clients / insights
        ↓
  Painel        /conversas (inbox + handoff)
```

## Subdivisão do Sprint 6

| Fase | Entrega | Status |
|------|---------|--------|
| **6.0** | Contrato + schema `outreach_jobs` + scaffolding agent/tools/skills + APIs stub + `/conversas` esqueleto | ✅ |
| **6.1** | Inbox `/conversas` (lista + thread + handoff UI) | ✅ |
| **6.2** | Webhook Evolution → persistir msg → resposta (sem tools ou 1 tool) | próximo |
| **6.3** | Tools v1 ligadas ao domínio (agenda + cliente) | |
| **6.4** | Skills + follow-up (lista retorno → fila → envio) | |
| **6.5** | MCP bridge (mesmas tools) + n8n opcional | |

## Tools v1 (fechadas)

| Tool | Domínio | Efeito |
|------|---------|--------|
| `get_unit_context` | shop | Nome loja, horário, profissionais bookable |
| `find_client` | clients | Por telefone / nome |
| `list_services` | catalog | Serviços ativos + preço/duração |
| `list_slots` | agenda | Horários livres |
| `book_appointment` | agenda | Cria `appointments` |
| `cancel_appointment` | agenda | Cancela / no-show policy |
| `open_order` | orders | Abre comanda (opcional vínculo appointment) |
| `add_order_item` | orders | Serviço/produto na comanda |
| `list_followups` | insights | Retorno 60–100d / recorrência |
| `handoff_human` | conversas | `mode = human` |
| `send_whatsapp` | evolution | Envio (só runtime com conexão) |

## Skills v1

| Skill | Usa tools | Objetivo |
|-------|-----------|----------|
| `skill.schedule` | find_client, list_services, list_slots, book | Agendar pelo chat |
| `skill.order` | open_order, add_order_item | Empurrar consumo → comanda |
| `skill.followup` | list_followups, send_whatsapp | Convite retorno |
| `skill.handoff` | handoff_human | Recepção assume |

## Auto-configuração por unidade

No início de cada conversa (ou cache curto):

1. Resolver `tenant_id` pela instância Evolution  
2. Carregar `agent_profiles` (displayName = “Donna” ou outro)  
3. `get_unit_context` + catálogo → prompt dinâmico  
4. Filtrar `toolsEnabled` do perfil  

Replicar loja = novo tenant + perfil + conexão WA. Zero fork de código.

## MCP

As **mesmas** tools do registry serão expostas como MCP server (fase 6.5) para n8n/Cursor.  
Auth: token de serviço + `tenant_id` obrigatório.

## Segurança

- Webhook valida `webhook_secret` / assinatura Evolution  
- APIs de agente usam `AGENT_SERVICE_TOKEN` (não sessão de usuário)  
- Toda tool grava `agent_tool_calls`  
- Handoff: IA para de responder até humano devolver
