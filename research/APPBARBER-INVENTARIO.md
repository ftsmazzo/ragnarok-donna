# AppBarber — Inventário de UX (conta RagnaroK's)

Conta analisada: **RagnaroK's / Ragnarök Barbearia** (usuário Luciano Marchesini).  
URL: `https://sistema.appbarber.com.br/` (SPA AngularJS em `index.php#/...`).  
Capturas em: `research/appbarber-screenshots/`.

---

## Identidade visual

| Elemento | Observação |
|----------|------------|
| Login | Fundo fotográfico de ferramentas de barbeiro + card branco; logo navy "appbarber by ZUCCHETTI" |
| Header | Laranja vibrante (faixa superior) |
| Sidebar | Cinza escuro `#222D32` (estilo AdminLTE) |
| Fundo conteúdo | Cinza claro `rgb(242,242,242)` |
| Fonte | **Quicksand**, sans-serif |
| Blocos de agenda | Roxo (agendamentos), teal (bloqueio), cinza (fora do expediente) |
| Ações | Verde criar/editar, vermelho excluir/alerta, azul info/chat |
| Logo tenant | "RagnaroK's Barbearia" no topo da sidebar |
| Ruído UX | Banner "Carregando..." com frase motivacional; toasts persistentes; cookie banner; chat suporte; aba lateral "Caixa" |

Sensação geral: **painel operacional denso**, legado SaaS (AdminLTE + AngularJS), pouco "marca do salão", muito "sistema genérico laranja".

---

## Arquitetura de navegação

```
Agenda
Cadastros ▸ Clientes, Profissionais, Serviços, Pacotes, Tipos, Mensagens,
            Notícias, Pesquisa, Lembretes, Produtos, Clube, Cupons, Assinaturas…
Comandas ▸ Abertas, Histórico
Financeiro ▸ Caixa, Comissões, Fluxo/Painel, Contas, Caixinha…
Relatórios ▸ Agendamentos, Gerenciais (financeiro, perfil, estoque, comandas…)
Configurações ▸ Parâmetros, Rodízio, Lista de Espera, Funcionamento, Alertas…
Extras ▸ Tutoriais, Cursos, Ajuda, Marketing, Aplicativo Próprio (NOVO)
```

Rotas reais são **hash** (`#/agenda`, `#/clientes`, `#/caixa`…). Paths sem hash (`/clientes`) retornam 404.

---

## Telas mapeadas (resumo)

### Agenda (coração do produto)
- Views Dia / Semana / Mês
- Filtro por profissional (ex.: Diego)
- `+ Encaixe`, bloqueios, legenda de status (Agendado, Realizado, Ausência, Bloqueado…)
- Painel direito: mini-calendário, horários disponíveis, lista, espera, produtos/serviços
- Cards com cliente + telefone + serviço + observações internas

### Cadastros
- **Clientes:** ~4.828 registros; tabela + WhatsApp / Info / Editar / Excluir; pontos de fidelidade
- **Profissionais:** gestor, horários de trabalho, apelido, disponibilidade
- **Serviços:** preço, tempo, % comissão, categorias (Avulso, Recorrência, Extras, Combos) — ex.: Barba R$45/30min/40%
- **Produtos/Estoque:** venda vs uso interno, combos, fornecedores, compra
- **Pacotes:** pacotes vendáveis (ACE, hidratação, manutenção prótese…)
- **Clube / Pesquisa / Mensagens / Notícias**
- **Assinaturas:** tela de **upsell** ("Tenho Interesse"), não configuração completa nesta conta

### Comandas
- Abertas (vinculadas a agendamentos do dia)
- Histórico com filtros por período/status

### Financeiro
- **Caixa do dia:** entradas/saídas, saldo, Encerrar Caixa
- Comissões (sintético/analítico, vales, auxiliares)
- Fluxo de caixa / painel (líquido, a receber)

### Config
- Parâmetros (pontos, tolerância cancelamento…)
- Lista de espera, funcionamento, rodízio

### Alertas recorrentes
- Comandas abertas há até 90 dias
- Agendamentos recorrentes expirando em 7 dias

---

## Avaliação preliminar (para o nosso produto)

### Aproveitar (conceitos / domínio)
1. Modelo mental: **Agenda → Comanda → Caixa → Comissão**
2. Entidades: cliente, profissional, serviço (duração + preço + comissão), pacote, estoque, espera
3. Status de slot: agendado / realizado / ausência / bloqueado / encaixe
4. Observações no agendamento (indicação, desconto, recorrência)
5. Export Excel/PDF e filtros Ativos/Removidos
6. Multi-profissional na mesma agenda

### Melhorar (dores claras do AppBarber)
1. Visual genérico AdminLTE; pouco espaço para marca da barbearia
2. Densidade e ruído: loading motivacional, toasts empilhados, cookies, chat suporte
3. SPA antiga (AngularJS); sensação lenta / "Carregando..." frequente
4. Assinatura recorrente parece **módulo comercial fechado**, não self-serve
5. Tabelas repetitivas; pouca hierarquia visual moderna
6. Sem agente conversacional ligado à agenda/caixa

### Implementar (diferenciais nossos)
1. **Agente WhatsApp** (padrão Donna) falando com agenda/comanda via tools
2. **Plataforma multi-tenant** (padrão PrismaBook): 1 Zap/loja, planos, handoff humano
3. UX moderna: agenda como hero, menos chrome, identidade da barbearia
4. Assinaturas/recorrência nativas (não upsell de contato comercial)
5. Insights proativos (não só toasts): "15 recorrências acabando" → ação do agente
6. Gate humano no mesmo número + painel leve (estilo Donna)

---

## Próximo passo sugerido

Workshop curto: priorizar MVP em 3 camadas — (1) agenda+cadastros, (2) comanda+caixa, (3) agente IA — e decidir stack UI (herdar linguagem RagnaroK's vs marca nova).
