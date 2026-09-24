# Comissão — modelo operacional (AppBarber + áudios 23/09)

Fonte: áudios WhatsApp 2026-09-23 (transcrição) + validação Daniel 21/09 + paridade AppBarber.

## Hierarquia do % (fechado)

```
1. Override profissional × serviço/produto   (se existir)
2. % do serviço ou produto no catálogo       (padrão)
3. Sem % cadastrado → 0                      (não forçar 40% global)
```

**Não** existe “comissão base do profissional” como regra principal (AppBarber e áudio 23/09).  
O campo `staff.default_commission_bps` fica só como rede de segurança legado — não guiar UX nova por ele.

### Exemplos

| Caso | % usada |
|------|---------|
| Corte cadastrado 40%, sem override | 40% |
| Corte 40%, líder com override 45% nesse serviço | 45% só para ela |
| Pedicure/Manicure Donna 45% no catálogo | 45% para todos |
| Bebida/comida com 0% no produto | 0% |
| Produto com 10% no catálogo | 10% |

Ragnarok: a maioria dos serviços fica em 40% no **cadastro**.  
Donna: varia por serviço (35 / 40 / 45).

## Valor na comanda (fechado)

- Dá para **editar o valor** (e desconto) do item na comanda (serviço e produto).
- Comissão = `% resolvido` × **total cobrado na linha** (não o preço de tabela se a linha foi alterada).
- Desconto pontual em R$ (ex.: shampoo 70 → 65) = editar preço da linha, sem precisar do desconto global da comanda.

## Consumo entre profissionais (incluir)

### Produto (já existe em parte)
- Consumo de produto do profissional: **venda − 30%** (cobra 70%).
- Lança desconto na comissão de quem consumiu.

### Serviço na colega (a implementar)
Ex.: Beatriz faz pedicure na colega:

1. Item na comanda a **50%** do preço de tabela (atalho / tipo “consumo profissional”).
2. Quem **executou** ganha comissão sobre esses **R$ da linha** (ex.: 45% × 22,50).
3. O valor cobrado (R$ 22,50) é **descontado** da profissional que **recebeu** o serviço (consumo / advance `discount`).
4. Cliente da comanda = a profissional consumidora (ou vínculo explícito consumidora × executora).

Coca no mesmo atendimento: continua regra de produto (−30%) + desconto na consumidora.

## Pacote (já fechado 21/09)

- Venda do pacote: comissão **0**.
- Uso do crédito: base = preço do pacote ÷ N serviços; % do serviço (ou override).

## Escada de extras Ragnarok (Daniel 21/09) — opcional por tenant

| Meta extras no mês | % nos extras |
|--------------------|--------------|
| Sem meta | 40% |
| R$ 2.000 | 45% |
| R$ 2.500 | 50% |

Ordinário (corte, barba, recorrência, luzes) permanece na % do catálogo/override.  
Escada **não** substitui o modelo catálogo; é regra de casa em cima dos extras.

## Ainda fora

- Folga remunerada (salário ÷ 26).
- Taxa de cartão 50/50.

## Issues de entrega

1. Override % profissional × serviço/produto (+ duração/preço já previstos em `staff_services`).
2. Editar valor livre na linha da comanda + recalcular comissão.
3. Consumo de serviço entre profissionais (50% + desconto na consumidora + comissão na executora).
4. (Backlog) Escada de extras por meta, se Ragnarok pedir na esteira.
