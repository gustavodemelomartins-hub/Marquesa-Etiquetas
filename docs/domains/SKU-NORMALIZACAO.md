# SKU e variação — como a peça é identificada hoje

Levantamento da Fase 4, item 2. Descreve o que **existe**, não o que deveria
existir. Nenhum comportamento foi alterado para produzir este documento.

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
        ├─ normalização  ──────────────────►  OITO implementações (§3)
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

## 3. Problema encontrado: oito respostas para "qual é o código?"

Existem **oito** normalizações de SKU no backend — seis funções chamadas
`normSku`, uma por arquivo, e duas soltas dentro de outras funções. Quatro
removem o espaço do MEIO do código; quatro só aparam as pontas.

| Onde | Espaço interno | Papel |
|---|---|---|
| `api/src/sku.js` | **remove** | a canônica; espelha o índice `idx_produtos_sku_norm` |
| `api/src/variantes.js` | **remove** | escreve `loja_variantes.sku_norm` |
| `api/src/produtos.js` | **remove** | apagar, arquivar, dependências |
| `api/src/catalogo.js` | **remove** | importação e cadastro — grava `produtos.sku` |
| `api/src/fotos.js` | preserva | indexa `loja_fotos.sku_norm`, responde `/api/fotos/:sku` |
| `api/src/publicacao-catalogo.js` | preserva | fila de publicação |
| `api/src/nuvemshop.js` › `mapearSkus` | preserva | **chave do casamento com a loja** |
| `api/src/vendas-comandos.js` › `registrarVenda` | preserva | código digitado na venda |

`BR 1234` vira `BR1234` nas quatro primeiras e continua `BR 1234` nas quatro
últimas. A diferença não dá erro em lugar nenhum.

### Consequência de cada divergência

1. **`mapearSkus` — a mais cara.** Uma variante cujo SKU foi digitado na loja
   com espaço no meio entra no mapa como `BR 1234` e nunca casa com o código
   local `BR1234`. O código **parece não existir na loja** e a sincronização o
   ignora, sem aviso. É exatamente a "peça fantasma que ninguém encontra" que o
   cabeçalho de `sku.js` descreve.
2. **`fotos.js`.** A foto é indexada sob `BR 1234` enquanto
   `loja_variantes.sku_norm` guarda `BR1234`. A foto existe e nunca chega na
   peça.
3. **`publicacao-catalogo.js`.** A mesma divergência no caminho da publicação.
4. **`vendas-comandos.js`.** Sem consequência silenciosa: `saldosDoSku` não
   encontra e a venda para com "Código X não está no catálogo", que é a
   resposta certa. Está na lista porque é a mesma pergunta respondida de um
   oitavo jeito.

### O que NÃO foi encontrado

- nenhuma resolução ambígua sem erro explícito;
- nenhum ponto onde `0` seja confundido com ausente — `normSku(0)` é `"0"` nas
  três exportadas, e `resolverVariantes` aceita o `variante_id` 0 como id;
- nenhuma escrita direta em `produtos.qtd` fora de `estoque.js › movimentar`
  (cobrado por [scripts/razao-estoque.test.mjs](../../scripts/razao-estoque.test.mjs));
- nenhum movimento de estoque nascendo fora de `movimentar`.

## 4. Decisão pendente

**DP — unificar a normalização de SKU?**

Unificar significa fazer `mapearSkus`, `fotos.js` e `publicacao-catalogo.js`
usarem a normalização canônica. Isso **muda comportamento sobre dados reais**:

- um código da loja hoje invisível para a sincronização passaria a casar, e a
  próxima rodada escreveria estoque nele;
- fotos hoje órfãs passariam a vincular;
- `loja_fotos.sku_norm` já gravado continuaria com o valor antigo até a
  próxima leitura da loja.

Por isso **não foi corrigido aqui**. O risco de corrigir por interpretação, no
meio de uma refatoração, é maior que o de continuar convivendo com a
divergência por mais alguns dias: a mudança escreve estoque na loja.

O que falta para decidir: saber se existe, hoje, algum SKU com espaço interno
na loja. Isso se mede sem escrever nada, com
`POST /api/sync {"seco": true}` ou a análise de sincronização, comparando as
chaves lidas da loja com as do catálogo.

Enquanto a decisão não vier, o inventário em
[scripts/sku-normalizacao.test.mjs](../../scripts/sku-normalizacao.test.mjs)
impede que a lista cresça ou mude sem que alguém repare.
