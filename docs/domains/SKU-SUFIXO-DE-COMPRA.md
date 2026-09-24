# O sufixo `-2`, `-3`, `-4` das planilhas

Auditoria de **10/09/2026**. Diagnóstico apenas: **nenhum comportamento foi
alterado**, e nenhuma decisão foi tomada.

## A convenção

Nas planilhas históricas da Marquesa aparecem códigos assim:

```
212223      primeira compra/entrada daquela peça
212223-2    segunda compra
212223-3    terceira compra
212223-4    quarta compra
```

Comercialmente as quatro são o **mesmo** SKU `212223` na Nuvemshop. O sufixo
não é variação comercial nem produto diferente: é uma convenção de planilha
para identificar uma nova entrada da mesma peça.

Isto **não** é assunto da normalização global de SKU. `normSku()` não toca em
hífen, e não deve passar a tocar: hífen pode fazer parte de um código real —
o catálogo de produção tem exatamente um, e ele é legítimo (`MONTE-COLAR`).

## 1. Onde o SKU base é extraído

Em **um** lugar:
[`vendas-historico-normalizar.js › skuBase()`](../../api/src/vendas-historico-normalizar.js)

```js
export function skuBase(v) {
  const s = normalizarSku(v);
  if (s === null) return null;
  const m = s.match(/^(\d{4,})-\d+$/);
  return m ? m[1] : s;
}
```

Só corta quando a base tem **4 ou mais dígitos** e o sufixo é numérico. Por
isso `MONTE-COLAR` sobrevive inteiro, e `BR1234-2` **não** seria cortado — a
base tem letra.

### Uma segunda definição de "base", com regra diferente

[`vendas-historico.js › carregarCatalogo`](../../api/src/vendas-historico.js)
monta o índice do catálogo pelo lado de lá:

```js
const base = s.replace(/-\d+$/, '');
```

Sem a exigência de 4+ dígitos. As duas concordam nos códigos de seis dígitos
que a Marquesa usa, e discordam em qualquer código com letra: para `ABC-2`,
`skuBase` devolve `ABC-2` e `carregarCatalogo` indexa como `ABC`. Hoje isso não
afeta nada — não existe código assim —, mas são duas regras para uma coisa só.

## 2. O código original é preservado?

Sim, em três níveis, na mesma linha de `vendas_historico_itens`:

| Coluna | Guarda | Produção |
|---|---|---|
| `sku_original` | a célula da planilha, crua | — |
| `sku` | normalizado, **com** o sufixo | 60 de 1375 itens com hífen |
| `sku_base` | derivado, sem o sufixo | **0** com hífen |

O schema declara a intenção: `sku TEXT -- TEXT: aceita '996055-2'` e
`sku_base TEXT -- '996055', para casar com o catálogo`.

## 3. Onde a ocorrência 2/3/4 é representada?

**Em lugar nenhum como dado.** Ela existe apenas como texto dentro de `sku` e
`sku_original`. Não há coluna de ocorrência, nem índice, nem consulta que
responda "quais itens são da terceira compra". Para saber, é preciso voltar a
interpretar a string.

## 4. Como isso chega ao estoque

Não chega. Medido no dump de produção:

| Tabela | Linhas | Com hífen |
|---|---|---|
| `movimentos.sku` | 1.428 | **0** |
| `venda_itens.sku` | 31 | **0** |
| `produtos.sku` | 790 | **1** (`MONTE-COLAR`) |
| `produtos_pendentes.sku` | 0 | 0 |

A razão contábil só conhece o código-base. O sufixo morre na fronteira do
importador de histórico.

## 5. Como isso chega à Nuvemshop

Não chega. `loja_variantes.sku`: **0 de 686** com hífen. A loja conhece um
código só, que é o comercial — exatamente como a convenção pressupõe.

## 6. Algum ponto trata `212223-2` como produto comercial diferente?

**Sim, um caminho permite isso, e ninguém o impede hoje.**

`produtos.sku` é PRIMARY KEY, e a importação de catálogo/estoque
([`catalogo.js`](../../api/src/catalogo.js)) **não** conhece a convenção: ela
não corta sufixo nenhum. Uma planilha de Estoque Total com uma linha
`212223-2` criaria um **produto separado**, com estoque próprio, ao lado de
`212223` — dois saldos para a mesma peça física, e só um deles casando com a
loja.

Isso não aconteceu: o catálogo de produção tem um único código com hífen, e ele
é legítimo. Mas a proteção que evitou é a disciplina de quem monta a planilha,
não o sistema.

`GET /api/produtos/sku/auditoria` já classifica sufixos como uma anomalia a
reportar (`a.sufixos`), o que indica que o risco é conhecido.

## 7. O novo `normSku()` interfere?

Não. Ele remove espaço e passa para maiúsculas; hífen atravessa intacto:
`normSku('212223-3')` é `'212223-3'`. A regra de 10/09/2026 (espaço interno não
diferencia SKU) e esta convenção são independentes.

Um detalhe que a unificação **não** alcançou: o importador de histórico tem a
sua própria normalização, `normalizarSku()`, que faz
`limpar(v).toUpperCase().replace(/\s+/g, '')` — mesmo efeito da canônica, nome
diferente, definição separada. Ela alimenta `sku` e `sku_base`. Não foi tocada
porque não é `normSku` nem `.trim().toUpperCase()`, e porque mexer no
importador de histórico não pertencia àquele commit.

## 8. Existem testes protegendo a regra?

Dois, ambos no catálogo `worker-local` — não rodam no gate rápido:

- `src/vendas-historico-test.mjs:238` — *"o SKU com sufixo continua TEXTO"*,
  com o caso real `996055-2`;
- `src/sku-auditoria-test.mjs:111` — *"o sufixo `-2` aparece como sufixo"*.

Nenhum teste puro cobre `skuBase()` diretamente, e nenhum cobre a divergência
entre as duas definições de base.

## Decisões que precisam de você

Nenhuma foi tomada. Nada aqui é urgente — o estado atual está consistente
porque a convenção nunca chegou ao catálogo.

1. **`212223-2` pode existir em `produtos.sku`?** Se não, a importação de
   catálogo deveria recusar ou consolidar; se sim, precisa ficar explícito que
   são dois produtos e por quê. Hoje o sistema aceita em silêncio.
2. **Qual é a definição de "base"?** `/^(\d{4,})-\d+$/` (exige base numérica) ou
   `/-\d+$/` (qualquer base)? As duas convivem.
3. **A ocorrência deve virar dado?** Uma coluna `ocorrencia INTEGER` responderia
   "terceira compra" sem interpretar string. Isso é mudança de schema, e vale a
   pena só se alguém precisar da pergunta.
4. **Unificar `normalizarSku` com `normSku`?** Mesmo efeito hoje; duas
   definições continuam sendo duas.
