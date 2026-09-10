# SKU e variação — como a peça é identificada hoje

Fase 4, item 2. Descreve o que **existe** hoje, depois da unificação de
10/09/2026.

> **Regra de negócio oficial (Gustavo, 10/09/2026):** espaço interno não
> diferencia SKU na Marquesa. `BR1234` e `BR 1234` são a mesma identidade.

Fonte da regra: [api/REGRAS.md](../../api/REGRAS.md). Gates executáveis:
[scripts/sku-normalizacao.test.mjs](../../scripts/sku-normalizacao.test.mjs) e
[src/variantes-resolucao-test.mjs](../../src/variantes-resolucao-test.mjs).

## 1. As duas identidades, e para que serve cada uma

| | `sku` | `variante_id` |
|---|---|---|
| O que é | o código da peça, PRIMARY KEY de `produtos` | o id da caixinha na Nuvemshop |
| Quem cria | a Marquesa (planilha, cadastro, `gerarSku`) | a loja |
| Estável? | sim | sim, mas a loja pode renomear o VALOR sem trocar o id |
| Ausente significa | peça não cadastrada | "não sei de qual variação saiu" |

`movimentos` guarda as duas, mais o **nome** da variação:

```
movimentos(sku, variacao, variante_id, tipo, qtd, …)
```

`variacao` é o nome, e continua sendo o que fecha a invariante e o que a tela
mostra. `variante_id` é o que casa com a loja. Os dois convivem de propósito:
quem não sabe o id grava `NULL`, e `NULL` ali significa exatamente *não sei* —
a sincronização lê isso como motivo para **não** escrever naquele código,
nunca como permissão para escolher uma variante.

## 2. Mapa da resolução

```
código digitado / planilha / loja
        │
        ├─ normalização  ──────────────────►  sku.js › normSku  (uma só, §3)
        │
        ├─ produtos.sku                       exato, PRIMARY KEY
        │     └─ idx_produtos_sku_norm        unicidade real, em SQL
        │
        ├─ loja_variantes.sku_norm            escrito por variantes.js
        │     └─ varianteDaVenda()            venda acha a variação por aqui
        │
        ├─ produto_variacoes(sku, nome, variante_id)
        │     └─ `persistido`                 nome → id, o que a sync leu da loja
        │
        └─ mapearSkus(produtos da loja)       chave da loja → { produtos, variantes }
                  └─ resolverVariantes()      decide se empurra, e quanto
```

### Quem decide a variação, em cada operação

| Operação | Função | Como decide | Quando não sabe |
|---|---|---|---|
| Venda de balcão | `vendas-comandos.js › varianteDaVenda` | id informado tem de pertencer ao código; se houver **uma** variante só, usa ela | mais de uma e nenhuma escolhida → **409** "diga qual foi vendida" |
| Correção de item | `venda-correcao.js` | id/nome novos informados | mais de uma cadastrada e nada informado → **erro com a lista** |
| Empurrão para a loja | `variantes.js › resolverVariantes` | `movimentos.variante_id` → `produto_variacoes.variante_id` → **bloqueia** | um dos cinco `IMPEDIMENTOS` |
| Pendências | `pendencias.js` | oferece as variações cadastradas para escolha humana | a pendência fica aberta |
| Estoque | `estoque.js › movimentar` | grava o que recebeu, sem inventar | grava `NULL` |

Nenhuma dessas escolhe "a primeira" nem "a de mesmo nome por coincidência".
As cinco recusas possíveis do empurrão estão em `IMPEDIMENTOS`:
`duplicado`, `maleta`, `sem_reparticao`, `variacao_nao_mapeada`,
`sem_variante_id`.

## 3. A unificação de 10/09/2026

Antes: **23** normalizações de SKU no backend — seis funções `normSku`, uma por
arquivo, e dezessete `String(x).trim().toUpperCase()` soltos dentro de outras
funções. **Dezenove preservavam o espaço do meio.** As quatro canônicas eram
`sku.js`, `variantes.js`, `produtos.js` e `catalogo.js`.

Depois: **uma**, em [api/src/sku.js](../../api/src/sku.js). `produtos.js` e
`variantes.js` reexportam o mesmo objeto de função, porque o nome já fazia parte
da superfície deles. Todo o resto importa.

A medição que autorizou a mudança (dump de produção, somente leitura,
10/09/2026) mostrou **impacto zero sobre os dados de hoje**:

| | |
|---|---|
| SKUs no catálogo local | 790, **nenhum** fora da forma canônica |
| Variantes na loja (espelho de 06/09) | 686, sob 631 códigos, **nenhum** com espaço interno |
| Variantes que passariam a casar | **0** |
| Colisões após remover espaços | **0** |
| Fotos que passariam a vincular | **0** (`loja_fotos` e `fotos_orfas` vazias) |
| Ambiguidade nova | **0** |

Quatro códigos existem na loja e não no catálogo (`131576`, `264141`, `349129`,
`925252`). Não é normalização: são peças sem cadastro local.

### O que a unificação muda daqui para a frente

Nada no dado existente. O que muda é o dia em que alguém digitar um código com
espaço:

- `mapearSkus` passa a casar esse código com o catálogo, em vez de tratá-lo como
  inexistente na loja. Se dois anúncios diferentes tiverem `BR1234` e `BR 1234`,
  eles passam a ser o MESMO código — e aí `resolverVariantes` recusa por
  `duplicado`, que é a resposta certa sob a regra nova: não há como dividir
  estoque entre dois anúncios;
- o SKU de um pedido da Nuvemshop ([sync.js](../../api/src/sync.js)) passa a
  casar em vez de cair em `itensIgnorados`;
- foto, publicação, garantia, saída sem faturamento, personalização, correção de
  item e histórico passam a resolver o mesmo código que o estoque resolve.

### Achados que NÃO foram tocados

Levantados na mesma medição, e deixados como estão por decisão explícita:

1. `sincronizar` chama `gravarRetratoDaLoja` sem olhar o `seco`, enquanto
   `sincronizarSomenteEstoque` faz `if (!seco)`. Uma rodada seca escreve
   `produtos.url_loja`, `estoque_loja` e `visivel` no catálogo inteiro;
2. `sync_execucoes` tem 4 linhas, todas `seco=1`, a última em 26/08 com status
   `pausado`. Nenhuma rodada real registrada. O espelho foi atualizado em 06/09
   por outro caminho, que não abre execução;
3. 78 movimentos sem identidade de variação em códigos que têm variação — é o
   acervo da Central de Pendências.

## 4. O que continua valendo

- nenhuma resolução ambígua sem erro explícito;
- `0` nunca é ausente — `normSku(0)` é `"0"`, e `resolverVariantes` aceita o
  `variante_id` 0 como id;
- nenhuma escrita direta em `produtos.qtd` fora de `estoque.js › movimentar`,
  cobrado por [scripts/razao-estoque.test.mjs](../../scripts/razao-estoque.test.mjs);
- nenhum movimento de estoque nascendo fora de `movimentar`;
- a normalização em JavaScript espelha, caractere por caractere, a expressão do
  índice `idx_produtos_sku_norm` — o SQLite só usa índice de expressão quando a
  consulta repete a expressão igual.

O gate [scripts/sku-normalizacao.test.mjs](../../scripts/sku-normalizacao.test.mjs)
reprova uma segunda definição, uma reexportação não declarada, um
`.trim().toUpperCase()` à mão, e o uso sem import.
