# Histórico incompleto e reconciliação por inventário

Decisão de negócio de **10/09/2026**, registrada antes do item de Inventário da
Fase 4. Nada foi implementado por causa deste documento.

## A decisão

> **O passado não é reconstruído por adivinhação.**
>
> Se um movimento histórico não permite saber hoje se a peça era Prata, Ouro
> Rosa ou aro 18, ele **permanece historicamente incompleto**.

Está proibido, em qualquer implementação futura:

- escolher a primeira variação;
- inferir pelo nome;
- casar por coincidência;
- reescrever o movimento antigo;
- inventar `variante_id`.

É a mesma regra 2 do [CLAUDE.md](../../CLAUDE.md) — nunca chutar a distribuição
de uma variante — aplicada ao passado em vez de ao presente. Um movimento sem
identidade é uma informação que não existe; preenchê-la com o palpite mais
provável a transforma numa informação **errada**, e uma informação errada não
se distingue depois de uma certa.

## Como a verdade volta: inventário físico

A verdade operacional é restabelecida pela contagem física da Sthefany, não por
processamento.

```
maleta volta para a Marquesa
   │
   ├─ Sthefany confere FISICAMENTE quais peças e quais variações estão nela
   │
   ├─ o sistema compara:  saldo esperado   ×   saldo contado
   │
   └─ a diferença vira MOVIMENTO DE AJUSTE pela razão de estoque
```

Duas consequências que a implementação precisa respeitar:

1. **Nunca `UPDATE produtos SET qtd = …`.** O ajuste passa por
   `estoque.js › movimentar`, como tudo o que mexe em estoque. Isso já é
   cobrado por [scripts/razao-estoque.test.mjs](../../scripts/razao-estoque.test.mjs);
2. **A diferença fica registrada no histórico.** A contagem não apaga a
   dúvida antiga: ela acrescenta o fato novo. O movimento antigo continua
   existindo, incompleto; o estoque atual passa a estar reconciliado.

O passado fica como está. O presente fica correto. As duas coisas convivem, e é
a razão contábil que as mantém coerentes.

## Retrato dos 78 movimentos (produção, 10/09/2026)

Medido no dump de produção, somente leitura. São movimentos sem `variacao` e
sem `variante_id` em códigos que **têm** variação cadastrada. Não são um
problema só — são três:

| Tipo | Quantos | Soma | Origem | O que realmente falta |
|---|---|---|---|---|
| `consignacao` | 36 | **0** | maleta | qual variação saiu na maleta |
| `devolucao` | 7 | **0** | acerto | qual variação voltou |
| `entrada` | 27 | +130 | importação | o saldo inicial nunca foi repartido |
| `ajuste` | 5 | −8 | variação, reconciliação | correção antiga sem identidade |
| `venda` | 3 | −3 | venda | qual variação o cliente levou |

- **43 estão ligados a maleta** (`maleta_id` preenchido) e somam **zero**: não
  afetam o saldo total, porque consignação e devolução não movem o total —
  a peça continua sendo da Marquesa, só mudou de lugar (§5.3). O que falta
  neles é identidade, não quantidade. **São exatamente os que o inventário de
  maleta resolve**, e `maleta_item_variacoes` já é o lugar onde a identificação
  é gravada, sem movimentar estoque (§8.4);
- **27 `entrada` de importação** são outra coisa: o saldo inicial entrou sem
  repartição. Isso não é caso de inventário e sim de **repartir**, que a Central
  de Pendências já oferece hoje (`sem_reparticao`);
- **3 vendas e 5 ajustes** são os irrecuperáveis de verdade. A peça saiu,
  ninguém disse qual era, e nenhuma contagem futura vai dizer o que aconteceu
  **naquele dia**. Estes ficam incompletos para sempre — e é a decisão acima que
  torna isso aceitável em vez de um problema em aberto.

Janela: 21/08/2026 a 05/09/2026. Concentração: um código com 10 movimentos e
3 variações; sete códigos com 3 ou mais.

## O que a Central de Pendências deve poder dizer, no futuro

Conceitualmente — **sem implementar a UX agora**:

```
pendência histórica
  → não foi possível identificar retroativamente
  → situação operacional reconciliada por inventário em <data>
```

Três estados distintos, que hoje não têm como ser distinguidos na tela:

| Estado | Significa |
|---|---|
| aberta | ainda dá para identificar — a peça está em maleta aberta, ou falta repartir |
| histórica, irrecuperável | a peça já saiu; ninguém vai saber qual era |
| reconciliada por inventário | o estoque atual está certo desde `<data>`; o registro antigo segue incompleto |

Hoje as três aparecem iguais. A terceira só passa a existir quando o inventário
gerar o ajuste — por isso ela pertence ao item de Inventário, não ao de
Variações.

## Onde isto entra

**Fase 4, item 4 — Inventário.** Este documento é o requisito de entrada dele.
O item 3 (kits) e o item 2 (variações e SKU) não implementam nada disto.

Quando o item 4 começar, o que ele precisa provar:

- a contagem física gera ajuste **pela razão**, nunca escrita direta em `qtd`;
- o ajuste diz de qual contagem veio, com data;
- o movimento antigo continua intacto — nenhuma linha histórica é reescrita;
- um código com variação e contagem por variação gera um ajuste **por
  variação**, não um ajuste agregado que voltaria a perder a identidade;
- contar duas vezes a mesma maleta não gera ajuste duplicado (idempotência).
