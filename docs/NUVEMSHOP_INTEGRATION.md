# Integração com a Nuvemshop

Transporte em [api/src/nuvemshop.js](../api/src/nuvemshop.js); decisões de
sincronização em [SYNC_ENGINE.md](SYNC_ENGINE.md).

API: `https://api.nuvemshop.com.br/2025-03/{store_id}`
· [documentação oficial](https://tiendanube.github.io/api-documentation/intro)

## Autenticação

Duas credenciais, ambas Secrets do Worker:

| Secret | O que é |
|---|---|
| `NUVEMSHOP_TOKEN` | Access token da loja. Vai como `Authorization: Bearer …` |
| `NUVEMSHOP_STORE_ID` | Número da loja. Faz parte do caminho da URL |

`Nuvemshop.configurada()` é `false` enquanto faltar qualquer um dos dois, e
a rodada termina avisando que a loja não está conectada — não falha calada.

### O User-Agent é obrigatório

Sem ele a API responde **400**, não 401 — o que faz o erro parecer qualquer
outra coisa menos o que é. A loja de mentira dos testes reproduz isso de
propósito.

### OAuth (app de parceiro)

Existe porque o caminho "Aplicativo sob medida" (token direto no painel da
loja) não está disponível no plano dela.

```
dono da loja autoriza o app
  → Nuvemshop redireciona para GET /api/nuvemshop/callback?code=…
  → POST https://www.tiendanube.com/apps/authorize/token
      { client_id, client_secret, grant_type: authorization_code, code }
  → página HTML mostrando NUVEMSHOP_TOKEN e NUVEMSHOP_STORE_ID para copiar
```

Duas decisões deliberadas em [api/src/nuvemshop-oauth.js](../api/src/nuvemshop-oauth.js):

- a rota fica **fora** da checagem da `API_KEY` — quem chega nela é o
  navegador vindo da Nuvemshop, e quem prova a autorização é o `code` de uso
  único (5 minutos de validade), não o Bearer do painel;
- ela **não grava nada**. O token aparece na tela para ser colado à mão nos
  Secrets. Chave de acesso não se move sozinha de um lugar para outro.

Precisa de `NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET` nos Secrets.

## Limite de requisições

Balde furado: capacidade 40, vaza 2 por segundo (plano padrão; planos
maiores multiplicam por 10, e ficar no limite menor é seguro para os dois).

O cliente **não conta o balde**: espaça as chamadas em `INTERVALO_MS = 550`
e, quando a própria API avisa que encheu (`429`), obedece o header
`x-rate-limit-reset` e tenta de novo, até 3 vezes. Menos esperto, erra menos.

## Leitura

| Método | Chamada | Nota |
|---|---|---|
| `produtos()` | `GET /products` | Todas as páginas |
| `pedidos(desdeISO)` | `GET /orders?status=any&created_at_min=…` | Todas as páginas |

Duas funções leem o mesmo `GET /products` e respondem perguntas diferentes:

- `mapearSkus(produtos)` — "o que a loja tem sob o código X?". Agrupa por
  SKU e descarta variante sem SKU. É o que a sincronização usa.
- `catalogoDeVariantes(produtos)` — "o que existe lá, ponto". Uma linha por
  variante, **inclusive** as sem SKU, as de produto que não é nosso e as de
  produto de variante única. É o que
  `POST /api/loja/variantes/importar` grava em `loja_variantes`.

`listarTudo` pagina com `per_page=200` (o máximo) e para quando o lote vem
menor que 200 — com teto de **40 páginas** (8.000 registros). Uma loja que
passe disso teria o excedente silenciosamente ignorado.

## Escrita

Só uma, e só de estoque:

```
PATCH /products/stock-price
[ { id: <produto>, variants: [ { id: <variante>, inventory_levels|stock } ] } ]
```

Enviado em **lotes de 25 produtos**. Com 2 requisições por segundo, mandar
um por produto levaria minutos para os ~600 da loja.

`inventory_levels` substituiu o campo `stock`, que segue existindo por
compatibilidade. A leitura considera os dois (`somaEstoque`); a escrita usa
`inventory_levels` quando a variante declara `location_id`, e cai no `stock`
simples quando a loja ainda não tem multi-estoque.

**Nada mais é escrito.** O sistema não cria produto, não muda preço, não
altera pedido, não cancela nada.

## Matching de SKU

`mapearSkus(produtos)` monta `SKU → { produtoId, varianteId, variantes[],
produtos:Set, estoque, url, nome, visivel, atributos[] }`.

Pontos que não podem ser perdidos numa mudança futura:

1. **O estoque mora na VARIAÇÃO, não no produto.** O estoque do código é a
   soma das suas variações — o único número comparável com o nosso, que é um
   só por código.
2. **Normalização**: `trim()` + `toUpperCase()`. O sufixo (`486476-2`) **não**
   é removido aqui: na loja, cada variação é uma linha de estoque própria e
   precisa ser endereçada como é. Quem consolida sufixo é a importação, e
   anunciando o que consolidou.
3. **Todas as variações ficam guardadas.** A versão antiga descartava da
   segunda em diante, e o efeito era silencioso: o estoque inteiro do código
   ia parar num tamanho só.
4. **Campos traduzíveis** vêm como `{pt: "…"}` em lojas multi-idioma e como
   string simples nas demais. `texto()` resolve os dois.

### Variação ≠ duplicata

Dois casos distintos, que a versão antiga confundia (acusava 56 duplicatas
numa loja que tem 2):

| Situação | Como se detecta | Consequência |
|---|---|---|
| Variações do MESMO produto (tamanho, cor, comprimento) | `variantes.length > 1` e `produtos.size == 1` | Normal. Cada variação tem a sua caixinha |
| Mesmo código em produtos DIFERENTES | `produtos.size > 1` | **Duplicado**: o estoque se divide entre dois anúncios e a conta nunca fecha |

O nome do atributo que varia ("Tamanho", "Comprimento", "Aro") vem de
`p.attributes` — **não é lista fixa nossa**. Presumir "tamanho ou cor"
quebraria no primeiro produto vendido por comprimento.

## Quando a sincronização NÃO empurra estoque

Registrado em `relato.semEmpurrar` e exposto na aba Loja:

| `motivo` | Por quê |
|---|---|
| `duplicado` | Mesmo código em dois anúncios: não há como dividir |
| `maleta` | Peça consignada: a maleta ainda não sabe qual variação saiu, e descontar da errada tiraria do ar peça que está aqui |
| `sem_reparticao` | Repartição pela metade: as caixinhas somadas dariam menos que o total, e a diferença sairia do ar |
| `variacao_nao_mapeada` | Há saldo numa variação que não corresponde a `variant_id` nenhum da loja — valor renomeado, variante trocada, aro que saiu do ar |
| `sem_variante_id` | A loja não informou o id de alguma variante do produto |

Todos vêm com `explicacao` em português e `detalhe` com os dois números lado
a lado, e o conjunto sai também em `GET /api/variacoes/revisao`.

**A regra que manda em tudo isto:** se a loja tem mais de uma variante e o
sistema não sabe exatamente quanto pertence a cada `variant_id`, não se
escreve nada — nem parte. Ver [../api/REGRAS.md](../api/REGRAS.md) § 8b.

Além desses, produto que só existe na loja **nunca é tocado**: não conhecer
um produto não é o mesmo que saber que ele tem zero.

## Dry-run e freios

- `POST /api/sync` com `{ seco: true }` — lê a loja inteira, calcula tudo,
  grava o retrato e o histórico, e **não escreve na Nuvemshop**.
- `{ forcar: true }` — ignora o freio. É o "aplicar mesmo assim" do painel.
- O cron **nunca** força.

Detalhe dos freios em [SYNC_ENGINE.md](SYNC_ENGINE.md).

## Tratamento de erro

`explicarErro()` traduz a resposta para uma frase que diz o que **fazer**,
porque os dois erros mais prováveis são de configuração:

| Status | Diagnóstico |
|---|---|
| `Missing required scope: X` | O token não tem a permissão. Refazer o app marcando o escopo **e gerar token novo** — o token guarda as permissões de quando foi criado |
| 401 | Token colado pela metade ou `NUVEMSHOP_STORE_ID` errado |
| 404 | Normalmente `NUVEMSHOP_STORE_ID` errado |
| 429 | Não é falha: é a API pedindo para esperar. Tratado com retry |

## Testar sem tocar na loja

[src/loja-falsa.mjs](../src/loja-falsa.mjs) sobe uma Nuvemshop de mentira em
`localhost:8799`. Nenhuma chamada sai, nenhum token real é preciso. Ver
[TESTING.md](TESTING.md).
