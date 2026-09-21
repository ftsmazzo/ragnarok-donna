# Lembretes abertos (sem escopo para implementar agora)

## Comissão — ordinário × extra + meta
- **Validado 2026-09-21** (textos + áudios): ver `COMISSAO-VALIDACAO-DANIEL.md`.
- Ordinário (não é extra): **corte, barba normal, recorrência, luzes**.
- Extra: demais serviços.
- Pacote: comissão no uso (valor÷N serviços), não na venda.
- % fechado (21/09): **tudo 40%**; meta de extras R$ 2.000 → 45%, R$ 2.500 → 50%. Cálculo na comanda e ranking `/relatorios/extras` usam serviço extra. Folga e taxa de cartão ainda pendentes.

## Financeiro parrudo
- Modo financeiro mais completo (conta bancária, conciliação, fluxo integrado com estoque/vendas).
- Pode ser módulo opcional vendável depois. Sem orientação de input ainda — não implementar.

## Venda 24/7 (marketing)
- Pacote futuro: subir fotos da loja → tratamento/posts → agendar no Instagram via Venda 24/7.
- Só anotado. Não implementar agora.

## CRM — VALIDADO (2026-09-20)
- Topo de funil no **1º WhatsApp**; frequência pelo **histórico**; lista em **tela CRM + Lembretes**.
- Incluir **assinatura mensal** (além do pacote).
- Ordem: **origem → ficha → quem está na hora de voltar** → assinatura → painel dono.
- Detalhe: `CRM-VALIDACAO-DANIEL.md`. Pronto para Issues e build.

## Sync AppBarber / AppBeleza → banco (2026-09-20)
- Ragnarok: export `2026-09-20T18-19-21` + import upsert ok.
- Donna: export `2026-09-20T18-29-22` + import upsert.
- Fonte da verdade = sistemas antigos; painel alinhado para operação segunda.

## Agendar pacote na comanda — FEITO (planilha por visitas)
- Botão **Planejar visitas** na carteira: N visitas (não 1 linha por crédito).
- Sugestão: 1 de cada tipo restante por visita (ex. 4 barba + 2 corte → 4 idas).
- Créditos só baixam no atendimento / Usar na comanda.
