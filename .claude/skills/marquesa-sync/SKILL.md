---
name: marquesa-sync
description: Carregue para qualquer tarefa envolvendo Nuvemshop, sincronização, pedidos do site, estoque online, matching de SKU, variantes, freios, dry-run, cron, ou os arquivos api/src/sync.js e api/src/nuvemshop.js. Estabelece a ordem de entendimento antes de qualquer mudança.
---

# Sincronização com a Nuvemshop

Antes de escrever uma linha, entenda **nesta ordem**. Pular um passo é como
as regressões deste arquivo aconteceram no passado.

## 1. Fonte da verdade

| Coisa | Quem manda |
|---|---|
| Estoque físico | **Nós.** A loja é destino, não fonte |
| Quais variações existem num código | **A loja.** `produto_variacoes` é apagada e regravada a cada rodada |
| Repartição inicial entre variações | A loja, **só em código virgem e só se a soma bater** |
| Que pedidos existem | A loja |
| Se um pedido virou venda aqui | **Nós**, por `vendas.externo_id` |

Confundir isso é o erro mais caro possível aqui: tratar a loja como fonte do
estoque físico faz uma venda no site ser desfeita na rodada seguinte.

## 2. Matching de SKU

`nuvemshop.js › mapearSkus`. O que precisa estar na sua cabeça:

- o estoque mora na **variação**, não no produto;
- SKU é normalizado com `trim()` + `toUpperCase()`, e o **sufixo não é
  removido aqui**;
- **variação ≠ duplicata**: mesmo código em variações do mesmo produto é
  normal; mesmo código em produtos **diferentes** é cadastro duplicado;
- o nome do atributo que varia vem de `p.attributes` — não presuma
  "tamanho ou cor";
- campos traduzíveis vêm como `{pt: "…"}` em loja multi-idioma.

Detalhe completo: [docs/NUVEMSHOP_INTEGRATION.md](../../../docs/NUVEMSHOP_INTEGRATION.md)

## 3. O fluxo de pedidos

```
loja.pedidos(desde − 6h) → para cada pedido não visto:
    casa cada item pelo SKU
    item que não casa → relato.itensIgnorados  (anunciado, não engolido)
    pedido cancelado no site → ignorado
    → vendas (origem 'site', externo_id 'nuvemshop:<id>')
    → venda_itens + movimentar(tipo 'venda')   no mesmo db.batch()
```

**Idempotência é obrigatória**, não desejável. O cron pode rodar duas vezes
e a janela olha 6 horas para trás de propósito. A trava é o índice único
`vendas.externo_id` — do banco, não da lógica.

## 4. Estoque

```
em casa = produtos.qtd − consignado em maletas aberta/em_acerto
```

Kit sai dessa fórmula (`qtd` dele é sempre 0) e é resolvido por
`saldosDoSku`. Código com variação usa o saldo **por variação**, que é a
mesma soma agrupada mais fino.

Três situações em que a rodada **não empurra**, e nenhuma é bug:
`duplicado`, `maleta`, `sem_reparticao`. Elas viram `relato.semEmpurrar` e
`config.lojaVariacoes`, e aparecem na tela.

## 5. Freios

| `config` | Padrão | Pausa quando |
|---|---|---|
| `syncLimiteMudancas` | 40 | a rodada mudaria mais produtos que isso |
| `syncLimiteZerar` | 15 | a rodada zeraria mais produtos que isso |

Mudança em massa quase sempre é dado nosso quebrado, não a loja inteira
tendo se esgotado. Empurrar apaga o estoque real da loja e ela **para de
vender**.

Pausar grava `status='pausado'` e o motivo. `forcar: true` pula o freio;
**o cron nunca força**.

## 6. Dry-run

`POST /api/sync {"seco": true}` lê tudo, calcula tudo, grava o retrato e o
histórico, e não escreve na loja. **É o primeiro comando de qualquer
investigação.**

## Invariantes que sua mudança precisa preservar

1. Puxar pedidos **antes** de empurrar estoque. Inverter desfaz vendas.
2. `vendas.externo_id` único.
3. Semeadura só em código virgem, e só quando a soma da loja bate com o
   nosso total. Nunca servir na ordem até acabar.
4. Nenhum caminho escreve `produtos.qtd` fora de `movimentar`.
5. O freio existe, e o cron não o ignora.
6. O que a rodada decidiu não fazer é anunciado.
7. O retrato da loja é gravado **também** em rodada seca e pausada.

## Antes de dizer que terminou

```bash
node src/sync-test.mjs        # 67 asserções — banco limpo + Worker local
node src/variacoes-test.mjs   # 48 asserções
```

Os dois rodam contra `src/loja-falsa.mjs`, uma Nuvemshop de mentira local.
Nenhuma chamada sai. Ver [docs/TESTING.md](../../../docs/TESTING.md).

E confira a razão: `GET /api/estoque/conferir` tem de voltar vazio.

## Limites que valem lembrar

- `listarTudo` para em **40 páginas** (8.000 registros), em silêncio.
- 2 requisições por segundo. Escrita vai em lotes de 25 produtos.
- O sistema **não cria produto** na Nuvemshop. Código sem anúncio lá fica em
  "falta subir" para sempre — cadastrar é manual.
- Nenhuma escrita além de estoque. Não muda preço, não altera pedido.

## Escrever na loja de verdade é Classe C

Ver [docs/SECURITY.md](../../../docs/SECURITY.md). Sincronização forçada
contra produção precisa de autorização humana explícita, e de backup antes.
