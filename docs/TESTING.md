# Testes

Nenhum teste toca a nuvem. Todos rodam contra o Worker local
(`localhost:8787`), um SQLite dentro de `api/.wrangler` e — quando o assunto
é Nuvemshop — a loja de mentira de [src/loja-falsa.mjs](../src/loja-falsa.mjs).

Não há framework: cada arquivo é um script que imprime `ok` / `FALHA` e sai
com código 1 se falhou alguma coisa. Manter esse estilo é mais barato que
introduzir um runner.

## Pré-requisitos comuns

1. Worker local no ar (`npx wrangler dev --local --port 8787`);
2. **banco limpo** — as contagens mudam se sobrar dado de outro teste;
3. `api/.dev.vars` completo: as variáveis de OAuth **e**
   `ORIGENS_PERMITIDAS=http://localhost:8000`. Ver
   [DEVELOPMENT.md](DEVELOPMENT.md);
4. para os testes de navegador, também: `npm install` dentro de `src/`,
   `npx playwright install chromium`, e o dashboard servido por HTTP em
   `localhost:8000`.

> Faltar `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET` e
> `NUVEMSHOP_AUTH_BASE` no `.dev.vars` derruba exatamente 3 asserções da
> seção 10 do `sync-test` ("troca do código pelo token"). É falha de
> ambiente, não de produto — o `src/README.md` não listava essas três.

## Os testes

### `src/sync-test.mjs` — sincronização com a Nuvemshop
**67 asserções · ~10 s · precisa da loja falsa (ele mesmo a sobe)**

14 seções. O que fica provado, em ordem de importância:

1. pedido do site vira venda daqui e baixa o estoque;
2. o empurrão manda o estoque certo, e **só de quem ele conhece**;
3. rodar de novo **não cobra a mesma venda duas vezes** (idempotência pelo
   índice único `vendas.externo_id`);
4. a ordem certa — **puxar antes de empurrar**, senão a sincronização desfaz
   a própria venda;
5. item de pedido que não casa com o catálogo é anunciado, não engolido;
6. pedido cancelado no site não vira venda;
7. o freio segura uma rodada grande demais em vez de aplicar;
8. e aplica quando alguém manda aplicar (`forcar`);
9. token sem permissão de pedidos devolve a mensagem que diz o que fazer
   (o erro real de produção);
10. a troca do código pelo token (caminho do app de parceiro) funciona e
    mostra token e id da loja para copiar;
11. **a razão fecha** depois de tudo (§19);
12. a rodada guarda o retrato da loja que leu;
13. produto tirado do ar na loja deixa de constar como publicado aqui;
14. variação não é cadastro duplicado — e o código com variação volta a ser
    empurrado, cada aro na caixinha dele.

### `src/nuvemshop-writes-test.mjs` — staging pode ler, nunca escrever
**24 asserções · ~1 s · precisa da loja falsa, não precisa do Worker**

Chama `Nuvemshop` (`api/src/nuvemshop.js`) direto, sem subir
`wrangler dev` — a classe não depende de D1/R2/bindings. Prova a trava de
`NUVEMSHOP_WRITES_ENABLED`:

1. GET nunca é bloqueado, com a flag ausente ou `"false"`;
2. POST/PUT/PATCH/DELETE bloqueiam com a flag ausente;
3. e com a flag `"false"` explícita;
4. valores que não são exatamente `"true"` continuam bloqueando —
   fail-closed, não fail-open;
5. quando bloqueada, **nenhum request chega à loja** (a trava aponta para
   um endereço sem nada escutando: se o `fetch` saísse mesmo assim, o erro
   capturado seria de conexão recusada, não `NUVEMSHOP_WRITE_DISABLED` —
   e a loja falsa, à parte, confirma `escritas` vazio);
6. `"true"` libera de verdade, e a loja falsa registra a escrita;
7. espaço em volta de `"true"` é tolerado (resto de copiar/colar num secret).

### `src/vendas-reconstrucao-test.mjs` — a regra que vira linha em venda
**50 asserções · <1 s · teste PURO, sem Worker e sem banco**

A regra é uma função, então o teste é uma função. Roda em qualquer máquina.

1. mesmo cliente + mesma data = uma venda — vale para 1 linha e para **36**;
2. o que separa: datas diferentes, clientes diferentes;
3. o que **não** separa: acento, caixa e espaço sobrando (`José`/`jose`,
   `Vitória`/`vitoria`);
4. o que a planilha marca como não-venda (`PERDIDO`, `ACHO QUE FOI VENDIDO`,
   ajuste, correção) vira ajuste — e **muitas linhas continuam sendo venda**,
   que é a inferência errada que este teste existe para impedir de voltar;
5. pago / não pago / parcial / indefinido, com `NULL` nunca virando zero;
6. linha sem data vira venda própria e fica fora do ticket médio;
7. ticket médio sai só do elegível, e **não** é faturamento ÷ linhas;
8. canais divergentes viram `Misto` em vez de um escolhido a esmo;
9. reconstruir duas vezes dá o mesmo resultado, e a ordem de entrada não muda
   nada;
10. cada venda guarda os `Nº` da planilha que a formaram.

### `src/revendedora-nao-e-cliente-test.mjs` — revendedora sai do CRM, o dinheiro fica
**28 asserções · <1 s · teste PURO, sem Worker**

Não sobe Worker e não toca a nuvem: monta um SQLite em memória a partir do
`api/schema.sql` de verdade e conversa com `analytics.js` por um adaptador
mínimo que fala a língua do D1 (`prepare().bind().all()/.first()`).

O defeito que ele impede de voltar: a revendedora entrando no ranking como a
maior cliente da casa — 46 linhas de "Maleta" num acerto de 36 peças viravam
"Maior compra" num cartão de destaque (REGRAS § 23).

1. a revendedora **cadastrada** sai do ranking, da lista e dos destaques;
2. quem tem "Maleta" na observação mas **não** está cadastrada continua
   cliente — o papel vem do cadastro, nunca do texto da planilha;
3. faturamento e peças **continuam contando** o acerto; só a contagem de
   clientes o exclui;
4. a comissão estimada bate com a conta feita à mão sobre os acertos reais:
   R$ 3.186,25 vendidos → R$ 703,58 de comissão → R$ 2.482,67 líquidos, com
   o acerto de 13/06/2026 caindo na faixa de 30% e a prata a 10% à parte;
5. as premissas da estimativa viajam no payload (REGRAS § 24);
6. **sem revendedora cadastrada, nada muda** — todo mundo volta a ser
   cliente e não há acerto a estimar.

### `src/trocar-planilha-test.mjs` — trocar a planilha não soma duas versões
**26 asserções · ~40 s · precisa do Worker local**

Roda contra a planilha real quando ela está disponível
(`PLANILHA_JSON=/caminho/vendas.json`, ou
`src/__dados__/vendas-historico.json`); senão, contra uma amostra embutida.

O defeito que ele impede: a trava de idempotência é o **hash do arquivo**,
então uma planilha corrigida entra sem reclamar e o faturamento dobra sem
nenhum erro na tela (REGRAS § 25).

1. trocar **não duplica** — linhas, vendas, peças e faturamento ficam nos
   números da planilha nova, não na soma das duas;
2. o lote antigo fica `revertido` e só um lote continua de pé;
3. a resposta traz antes, depois e **delta**;
4. cliente com telefone, CPF ou cidade digitados à mão **sobrevive** à
   troca;
5. subir a MESMA planilha que já está no ar é recusado **antes** de reverter
   qualquer coisa;
6. arquivo ilegível também para na análise, com o histórico intacto;
7. o estoque não é tocado em nenhum momento — a razão contábil antes e
   depois é byte a byte a mesma.

### `src/erro-detalhe-test.mjs` — a tela diz a CAUSA, nunca só "Falha interna"
**6 asserções · ~5 s · não precisa do Worker (sobe uma API falsa na 8899)**

O defeito que ele impede: o painel inteiro parou em 2026-09-01, em DEV e em
produção ao mesmo tempo, e a única coisa que a tela sabia dizer era "Falha
interna". A causa real — o limite diário de leitura do D1, que é da CONTA
Cloudflare e não do banco — viajava no campo `detalhe` da resposta, e o
`api()` do painel jogava esse campo fora. `wrangler tail` também não ajudava:
ele imprime o OUTCOME da invocação, e uma exceção tratada pelo `catch` sai
como "Ok".

A API falsa responde `/api/health` com 200 e `/api/state` com 503 +
`{erro, detalhe}` — a forma exata da resposta nova do Worker. O teste prova:

1. a **causa** aparece na tela de conexão;
2. a **saída** também ("se renova à meia-noite UTC");
3. não sobrou o "Falha interna" genérico;
4. o console registra **etapa** e **status**;
5. a **chave de acesso NUNCA** aparece no console.

O item 5 é o que impede o diagnóstico de virar vazamento: a chave viaja no
cabeçalho `Authorization` e não pode entrar em nenhum `console.error`.

```bash
python -m http.server 8000        # a raiz do repositório, para servir dashboard.html
node src/erro-detalhe-test.mjs
```

### `src/venda-desconto-test.mjs` — desconto, data e cancelamento da venda
**36 asserções · ~15 s · precisa do Worker local**

O defeito que ele impede: `registrarVenda` descartava qualquer preço vindo
da tela e gravava o do catálogo. Dar desconto era possível no balcão e
impossível no sistema — a venda entrava pelo preço cheio e o faturamento
nascia acima do que entrou no caixa, sem erro na tela (REGRAS § 27).

1. **sem mexer no preço, nada muda** — o catálogo continua sendo a única
   fonte, e a venda de sempre continua igual;
2. com preço editado, o **total é o cobrado**, não o de tabela;
3. `preco_tabela` é gravado **sempre**, com ou sem desconto: sem ele, um
   reajuste de catálogo faz o desconto de ontem parecer outro número;
4. preço diferente do de tabela **sem motivo é recusado** (409) — é
   indistinguível de erro de digitação;
5. preço negativo é recusado; **zero com motivo é aceito** — brinde existe;
6. o preço do **catálogo não muda** — desconto é desta venda, não
   reprecificação da peça;
7. o **estoque baixa igual**, com e sem desconto: desconto é dinheiro, não
   peça, e a razão contábil continua fechando.

E mais três, sobre a venda em si (REGRAS § 28):

8. **venda de ontem é aceita** e aparece na lista DAQUELE dia, não na de
   hoje — quem vendeu no sábado e lança na segunda tinha de escolher entre
   data errada e não lançar;
9. **data futura é recusada** (400), e formato torto também — venda que não
   aconteceu contaminaria o faturamento do mês que vem;
10. **cancelar devolve a peça** e mantém a venda no histórico marcada como
    cancelada; cancelar de novo é 409, e a peça não volta duas vezes.

O lápis na tela — do clique até o banco, incluindo a recusa sem motivo
acontecer no navegador antes de ir ao servidor —, a venda de ontem pela
tela, a lista indo para o dia certo e o cancelamento devolvendo a peça são
provados em `src/e2e.mjs`, no fluxo de venda de verdade.

### `src/categoria-nome-test.mjs` — categoria não é material
**33 asserções · <1 s · teste PURO**

1. acerta os nomes reais do histórico, inclusive os erros de digitação que
   existem na planilha (`Binco`, `Piecing`);
2. o que não se reconhece vira `Outros`, nunca um chute pela segunda palavra;
3. `Banhada`, `Bruto`, `Prata 925` e `Aço Inox` **não são categorias** — é a
   trava contra o defeito que somava material e categoria na mesma rosca;
4. **a trava contra a duplicação**: lê o `CAT_MAP` de
   `src/dashboard.tpl.html` e compara entrada por entrada com
   `api/src/categoria-nome.js`. A tabela existe em dois lugares por
   necessidade (o painel de etiquetas classifica no navegador, sem rede);
   este teste garante que ela não divirja em silêncio.

### `src/vendas-historico-test.mjs` — histórico entra sem mover estoque
**76 asserções · ~40 s · precisa do Worker local e do banco limpo**

A prova de que importar a planilha antiga não desconta peça nenhuma:

1. **a regra absoluta** — zero movimentos criados, `produtos.qtd` intacto e
   `GET /api/estoque/conferir` vazio antes, depois e após reverter;
2. a análise (seca) não escreve nada e declara impacto `0` em estoque e loja;
3. os totais **fecham com a fonte** — o teste recalcula faturamento, peças,
   clientes, SKUs, linhas sem data e sem valor a partir das próprias linhas e
   compara com o relatório de reconciliação do backend;
4. o mesmo arquivo não entra duas vezes (sha-256 do conteúdo);
5. o cru é preservado: `-` e `Não lembro` viram NULL e não zero, o texto
   comercial da coluna Desconto continua legível, e o código com sufixo
   (`996055-2`) continua TEXTO;
6. a origem vira canal + contexto sem perder o bruto, `Maletra` vira `Maleta`
   por alias explícito, e origem múltipla vira `Misto` em vez de escolher;
7. a análise **prevê quantas vendas** as linhas vão virar, usando a mesma
   função que a reconstrução usa depois — o número que a tela mostra antes de
   aplicar é o que vai existir depois;
8. a linha marcada `PERDIDO` fica **fora do faturamento** mas **dentro do
   banco**, contada como ajuste;
9. reverter o lote desfaz tudo o que ele escreveu, camada derivada inclusive
   — e nesta ordem, porque o item aponta para a venda.

> **A planilha real não está no repositório.** Ela tem 351 nomes de clientes
> reais — dado pessoal, e este repositório é público. O teste roda contra
> `src/__dados__/vendas-historico.json` quando o arquivo existe (a pasta está
> no `.gitignore`), e contra uma amostra embutida de 12 linhas quando não —
> a amostra reproduz cada caso difícil observado no arquivo real.
>
> Para rodar contra a planilha de verdade, converta-a para JSON de matriz
> (uma linha por array, cabeçalho na primeira) e salve nesse caminho.

### `src/vendas-clientes-ui-test.mjs` — Painel de Vendas e Clientes na tela
**135 asserções · ~130 s · Playwright + servidor HTTP em `localhost:8000`**

Aponta para onde mandarem, então o mesmo arquivo verifica o local e o DEV
publicado:

```bash
PAINEL_URL=https://marquesa-dev.pages.dev/dashboard.html API_URL=https://marquesa-api-staging.marquesaasemijoias.workers.dev API_KEY=<a chave do staging> node src/vendas-clientes-ui-test.mjs
```

1. o **cabeçalho real** do sistema continua de pé — logo, Ajustes, e a
   navegação Estoque · Revendedoras · Vendas · Etiquetas, com as três
   sub-abas dentro de Vendas;
2. os cinco indicadores do painel mostram o número que a API devolve
   (conferido contra `/api/analytics/vendas`, não contra constante no teste),
   e **vendas ≠ linhas brutas** — a prova de que o agrupamento aconteceu;
3. o ticket médio **existe** e a tela explica a regra. *Este item afirmava o
   contrário até 2026-08-27; ver `api/REGRAS.md` § 21;*
4. os blocos aparecem: categoria, evolução, produtos **com foto ou lugar
   reservado**, origem, top clientes e insights — e nenhum insight inventa
   "% vs. período anterior", porque a comparação não está implementada;
5. a rosca mostra **categoria, nunca material**: `Banhada`, `Bruto` e
   `Prata 925` não podem aparecer como fatia;
6. o filtro de período muda os números de verdade;
7. Clientes tem o dashboard **e** a operação, e não diz `LTV` sobre gasto
   acumulado nem inventa "Última reativação";
8. **consistência visual verificável**: Clientes usa `.revgrid`/`.revcard`/
   `.rc-nm`/`.rc-row`/`.badge` de Revendedoras, e o *estilo computado* dos
   dois cards é comparado — raio, borda e fundo têm de bater. É o que
   transforma "segue o padrão" em asserção em vez de opinião;
9. busca, pílulas de status e paginação da lista;
10. o modal de cliente espelha o de revendedora, campo a campo;
11. o perfil abre e **a compra de muitas peças é UMA entrada na linha do
    tempo**, com os itens dentro dela;
12. a 390px nenhuma das telas gera rolagem horizontal, e o modal cabe;
13. nenhum erro de console;
14. o **acabamento** da segunda passada, medido em 1440px: a evolução por
    mês não ganha barra de rolagem e nenhum rótulo de mês é cortado; a lista
    de categorias mostra no máximo seis e a rosca continua desenhando todas;
    nenhum cartão sobra com mais de 28% de altura vazia; o indicador do topo
    de Clientes **não** se chama mais "Clientes ativos" (o número conta quem
    comprou no recorte, o estado da régua é outra coisa); o centro da rosca
    de saúde fala em **clientes**, não em peças; `em risco` tem a mesma cor
    no selo e na fatia da rosca; a legenda do gráfico liga e desliga cada
    cliente; e os filtros e a ordenação da reativação mudam de fato a lista.

### `src/corte-pedidos-test.mjs` — pedido antigo é história, não venda nova
**46 asserções · ~25 s · precisa do Worker local e do banco limpo**

O go-live mudou a operação de banco, e a loja ficou com pedidos que no banco
novo nunca foram vendas. `vendas.externo_id` não protege contra eles: ele
impede **repetir**, não **importar pela primeira vez**. Este teste defende o
freio que protege — `config.syncCorteEm` (`api/REGRAS.md § 4b`):

1. **sem corte, o pedido antigo entraria** — a rodada seca diz que criaria as
   vendas. É o cenário que torna o corte necessário, e ele fica provado em
   vez de suposto;
2. com corte, o pedido anterior à data não vira venda, não move estoque e
   não escreve movimento;
3. o que ficou de fora é anunciado em `pedidosAntesDoCorte`, com id, número,
   data, status e motivo (§22);
4. pedido **posterior** ao corte continua entrando — o corte nunca pode
   impedir o registro de uma venda de verdade;
5. rodar de novo não cobra a mesma venda duas vezes;
6. pedido sem data legível é barrado (*fail closed*);
7. `PUT /api/config` recusa data inválida **na entrada**, e `null` é a forma
   de tirar o corte;
8. segunda camada: `corteDePedidos` chamada direto, com um `db` de mentira —
   valor sujo gravado por SQL derruba a rodada em vez de virar "sem corte";
9. a razão contábil fecha no fim.

O teste também documenta, num comentário, a interação com a janela de 6
horas: cada rodada avança `syncUltimoPedido`, então a janela vai deixando os
pedidos mais antigos fora da leitura — o que a janela deixa passar, o corte
barra, e o que a janela corta já não era candidato.

### `src/variacoes-test.mjs` — aro do anel, comprimento da corrente
**48 asserções · ~6 s · precisa da loja falsa**

13 seções:

1. a sincronização descobre **e reparte sozinha**;
2. semear **não desfaz** o que já foi mexido à mão (a regra do código virgem);
3. a soma da loja tem de bater com o estoque, e a recusa explica;
4. repartir **não muda o total** do código (§19: são dois atos diferentes);
5. código **com** variação exige dizer qual, inclusive pela API;
6. código **sem** variação não muda em nada;
7. vender um aro baixa o aro **e** o total;
8. a razão fecha (§19);
9. aro que sumiu da loja some daqui na rodada seguinte;
10. saldo preso numa variante que a loja não tem mais TRAVA o empurrão —
    e repartir de novo devolve o órfão e destrava;
11. peça em maleta ainda segura o empurrão;
12. soma da loja que não bate não é repartida;
13. dá para desfazer uma repartição automática que não devia ter havido.

### `src/variantes-fase1-test.mjs` — casamento por variant_id e SKU único
**76 asserções · ~8 s · precisa da loja falsa**

16 seções. O cenário tem quatro casos lado a lado de propósito: produto sem
variação, produto de variante ÚNICA na loja, produto de três variantes que
varia por "Banho" e "Pedra" (nem cor nem tamanho — o ponto é que não existe
lista fixa nossa), e um código que só existe na loja.

1. a leitura importa o catálogo INTEIRO, inclusive variante de produto que
   não é nosso e produto de variante única;
2. os atributos chegam com o nome que a loja usa, em pares atributo/valor;
3. preço e imagem própria da variante vêm junto;
4. produto sem variação e produto de variante única são empurrados normal;
5. produto com várias variantes é repartido e cada uma vai para a sua;
6. **o mesmo total repartido de outro jeito manda números diferentes** — o
   teste que falharia se o sistema voltasse a escrever o total do código;
7. **variante renomeada/trocada na loja TRAVA a escrita inteira**, e a loja
   não é tocada — o bug que fechava a conta e zerava as caixinhas;
8. o produto travado aparece em `GET /api/variacoes/revisao` com os dois
   números;
9. SKU repetido é recusado e a recusa diz ONDE; minúscula com espaço é o
   mesmo código;
10. estar na loja é aviso, não recusa;
11. dez gerações simultâneas devolvem dez códigos diferentes;
12. a razão fecha (§19).

### `src/migracao-variantes-test.mjs` — a migration nas duas direções
**35 asserções · ~2 s · não precisa do Worker nem da rede**

Roda contra dois SQLite temporários com o `node:sqlite` do runtime. Pega o
`schema.sql` anterior direto do Git (`git show HEAD:api/schema.sql`).

1. o schema novo cria o banco do zero;
2. o schema antigo + a migration chegam ao MESMO banco — mesmas tabelas,
   mesmas colunas, mesmos índices. É o que pega schema e migration
   divergindo em silêncio, que só quebraria no dia de criar o banco do zero;
3. nada se perde na migration, e as colunas novas entram NULAS;
4. a razão continua fechando depois dela;
5. o índice único recusa `br1234` ao lado de `BR1234`;
6. duas linhas não podem apontar para a mesma variante — mas duas SEM id
   convivem;
7. rodar duas vezes só reclama de `duplicate column name`, que significa
   "já foi aplicada".

### `src/kits-test.mjs` — peça vendida inteira ou desmontada
**20 asserções · ~1 s · não precisa da loja falsa**

Reproduz o caso real: "Colar Casal de Filhos" (corrente + dois pingentes)
publicado também como "Colar Filho(a)" avulso, os dois anúncios disputando o
mesmo estoque físico.

1. não deixa um SKU com saldo próprio virar kit;
2. monta os dois kits;
3. com 1 de cada componente, os **dois** anúncios mostram 1;
4. **vender um derruba o outro na hora** — o problema real;
5. cancelar a venda devolve tudo aos componentes;
6. o carrinho recusa vender os dois juntos quando só há peça para um
   (validação contra o que as outras linhas do mesmo carrinho já reservaram);
7. kit não entra em maleta;
8. inventário ignora os kits e conta só os componentes reais;
9. a razão fecha no fim de tudo (§19).

### `src/e2e.mjs` — o caminho inteiro num navegador de verdade
**66 asserções · ~36 s · Playwright + servidor HTTP em `localhost:8000`**

12 seções, do portal de conexão ao fim: conectar, importar catálogo de uma
planilha fictícia, cadastrar revendedora pela tela, montar maleta bipando,
fazer o acerto, recarregar a página como se fosse outro aparelho,
**conferir que a razão fecha (§19)**, venda de balcão, inventário, o leitor
de código de barras (o caminho do iPhone) e, no fim, que **nenhum erro de
console apareceu**.

É o único teste que prova que a interface e a API conversam.

### `src/import-total-test.mjs` — a planilha é o estoque TOTAL, sempre
**13 asserções · ~14 s · Playwright + servidor HTTP**

Substituiu o `import-casa-test.mjs`, e por uma decisão de negócio, não por
manutenção: a tela **deixou de perguntar** se os números são o total ou só o
que está em casa.

A pergunta existia por um risco real — planilha que contou só a prateleira,
comparada contra o total, corta a peça que está numa maleta aberta. O
problema é que as duas respostas parecem certas na hora de responder, e a
errada estraga estoque em silêncio. Uma regra fixa, que se aprende uma vez,
vale mais que uma pergunta que precisa ser acertada toda vez.

Mesmo cenário do teste antigo (C1 com 10 no total, 3 numa maleta aberta), de
propósito: é nele que a diferença aparecia.

1. o seletor "total × só em casa" não existe mais na tela;
2. nem o seletor de destino da aba — nada de "Catálogo e estoque total" nem
   de criar maleta de revendedora por aqui;
3. a tela diz, em palavras, que a planilha inclui as peças com revendedoras;
4. a planilha é lida como TOTAL, sem ninguém escolher;
5. a análise vem ANTES de aplicar, e não escreve nada;
6. aplicar é o segundo ato, e é ele que escreve;
7. a razão fecha (§19);
8. a aba Loja, que usa a mesma janela para importar o export da Nuvemshop,
   continua funcionando — foi por isso que `openImport` ganhou contexto em
   vez de perder o seletor de vez;
9. nenhum erro de console.

### `src/fase2-telas-test.mjs` — as telas que destravam a decisão humana
**100 asserções · ~2 min · Playwright + loja falsa + servidor HTTP**

A FASE 1 ensinou o motor a **parar** quando não sabe a qual `variant_id`
pertence cada peça. O efeito colateral foi uma fila: 27 códigos travados em
produção, e nenhuma tela que soubesse destravá-los. Este teste prova as
telas dessa fase, na ordem dos 18 itens obrigatórios da FASE 2.

Cenário: `ANELB` com 3 variantes na loja e 6 peças aqui (o `sem_reparticao`
de verdade), `PULSEIRA` sem variação, `DESCARTE` cadastrada e nunca usada,
`VENDIDA` com uma venda registrada.

| # | O que fica provado |
|---|---|
| 1 | o código aparece com formulário, os dois totais lado a lado, uma linha por variante, e o `variant_id` **não** aparece na tela |
| 2 | soma menor que o total: botão travado **e** rota recusando com 409 e os dois números |
| 3 | soma maior: idem, e o total não se move |
| 4 | soma exata salva, com números diferentes dos da loja — vale o que a pessoa confirmou |
| 5 | "usar quantidades da loja" preenche o formulário e **não grava** — a fila do servidor não muda |
| 6 | depois de salvar, o produto sai da revisão e a razão (§19) fecha |
| 7 | a loja renomeia dois valores; o saldo continua na mesma variante e o produto **não** volta para a fila |
| 8 | cadastro sem variação: quantidade digitada, nenhuma variação criada |
| 9 | cadastro com 1 atributo: 3 combinações, total = soma, id `local:` em cada uma |
| 10 | cadastro com 2 atributos: 4 combinações, atributos com o nome que a pessoa inventou |
| 11 | SKU duplicado: aviso enquanto digita **e** recusa do backend, normalizada |
| 12 | SKU gerado no padrão `MQ`+5, e o seguinte é diferente |
| 13 | peça sem histórico: a janela lista o que vai junto e apaga de vez |
| 14 | peça com venda: sem botão de apagar, `DELETE` direto devolve 409 com `alternativa: 'arquivar'`, e arquivar preserva saldo e motivo |
| 15 | etiquetas: uma caixinha só, "Excluir selecionadas (N)" com confirmação, e o estoque intocado |
| 16 | Importar Estoque Total sem os seletores antigos; o fluxo de maleta agora mora dentro da revendedora |
| 17 | as mesmas telas em 390×844, sem rolagem horizontal |
| 18 | regressão: código não repartido continua segurado e **nada** é escrito na loja |

A contagem de requisições de escrita que chegam à loja falsa é, ela mesma,
uma asserção: nenhuma sai.

### `src/editar-peca-test.mjs` — quantidade por variação em "Editar peça"

A janela da peça passou a aceitar a quantidade de cada variação, e o total
do código virou a SOMA delas. O teste prova que isso NÃO é saldo
sobrescrito: a diferença vira um movimento de `ajuste` com obs dizendo de
quanto para quanto. Prova também o que continua valendo — sem
`ajustarTotal`, o 409 de Pendências é o mesmo; negativo é recusado; o
vínculo é por `variante_id` e sobrevive à loja renomear a variação;
`sem_reparticao` continua bloqueando a escrita de quem não foi repartido.

    node src/editar-peca-test.mjs

### `src/editar-peca-ui-test.mjs` — a mesma coisa no navegador

Campos editáveis com o `variant_id` no `data-`, a soma ao vivo, o aviso de
que o total vai mudar, as duas fotos como espaço fixo do produto, a ausência
de "Gerar fundo branco" no Estoque — e o teste obrigatório do BLOCO A: a
MESMA foto na tabela de Estoque e no cartão de Pendências, com URL que falha
virando espaço vazio em vez do ícone quebrado do navegador.

    node src/editar-peca-ui-test.mjs

### `src/sku-auditoria-test.mjs` — o padrão de SKU é medido, não suposto

Monta catálogos com respostas conhecidas e cobra que a auditoria diga
exatamente aquilo — inclusive "não sei". O ponto central: número crescente
não é sequência, e quem decide é a densidade da faixa. Prova também que a
auditoria conta qual formato o gerador está usando, em vez de deixar a
decisão escondida no meio do código.

    node src/sku-auditoria-test.mjs

### `src/sku-gerador-test.mjs` — o código gerado, depois da decisão

A auditoria rodou contra o catálogo real: 776 códigos, todos de seis
dígitos, sem prefixo, com densidade 0,001 na faixa. Formato inequívoco,
sequência inexistente — e este teste guarda as duas conclusões.

Prova que o gerado é sempre seis dígitos dentro de `100000–999999`, que o
formato antigo (`MQ` + 5) não sai mais, que chamadas simultâneas nunca
recebem o mesmo código, e — com um banco falso e o sorteio forçado — que o
sorteio caindo em cima de um código já usado é **descartado** nos quatro
lugares que impedem, sem deixar reserva órfã para trás e sem apagar a
reserva de outra pessoa. Prova ainda que o código digitado à mão é conferido
pelo BACKEND (letra, cinco ou sete dígitos, duplicado), que a planilha
continua aceitando o código do fornecedor, e que nenhum código existente é
alterado.

Roda contra o Worker local e, na parte do sorteio forçado, importa
`api/src/sku.js` direto — é o único jeito de provar o descarte sem depender
de uma colisão que acontece uma vez em mil.

    node src/sku-gerador-test.mjs

### `src/fotos-catalogo-test.mjs` — as fotos do catálogo chegam sozinhas

A rodada de sincronização guarda o espelho das imagens da loja
(`loja_fotos`) com o catálogo que ela já leu. Prova a amarração por
`image_id` (nunca por posição), a recusa de chutar dono quando o produto da
loja junta dois códigos, a galeria completa preservada, a foto tratada nossa
que não é sobrescrita, e a foto apagada na loja que some daqui.

    node src/fotos-catalogo-test.mjs

### `src/pendencias-nuvemshop-test.mjs` — quem responde o quê

Os dois banners gigantes saíram da aba Nuvemshop sem levar junto os números
nem as ações. Pendências passou a ter três seções nomeadas. O teste cobre as
duas pontas e termina provando que nenhuma escrita saiu para a loja.

    node src/pendencias-nuvemshop-test.mjs

### `src/revendedoras-test.mjs` — a área de Revendedoras vira operação

A aba inicial passou a ser Visão Geral (a lista completa continua ao lado),
a Agenda de acertos saiu do Estoque, e o Top Revendedoras sai do HISTÓRICO
real — o teste prova que, sem acerto fechado, a tela diz isso em vez de
ranquear pelo tamanho da maleta de hoje. Cobre também a capacidade de novas
maletas (com a reserva que impede zerar a casa), o contato no topo da ficha
e, sobretudo, o preview obrigatório do Anexo I: desconhecidos, divergências
e a prova de que NADA é gravado antes da confirmação.

    node src/revendedoras-test.mjs

### `src/shot-pos-fase2.mjs` — fotos das telas dos BLOCOS A–D

Não é teste: monta um cenário próprio e fotografa cada tela mudada, no
computador e no celular.

    node src/shot-pos-fase2.mjs /caminho/da/pasta

### `src/fase2-telas-fotos.mjs` — fotos das telas da FASE 2
**Playwright. Não é teste.**

Monta o mesmo cenário e tira 11 retratos de cada tela nova, em desktop
(1400×950) e celular (390×844). Recebe a pasta de saída como argumento:
`node src/fase2-telas-fotos.mjs fotos-fase2`.

### `src/loja-falsa.mjs` — infraestrutura, não teste
Nuvemshop de mentira em `localhost:8799`. Exige `User-Agent` (a real
responde 400 sem ele), pagina como a real, guarda tudo que chega no `PATCH`
e implementa a troca OAuth.

### `src/shot.mjs` — fotos das telas
**Playwright. Não é teste.**

Não é teste: tira fotos da Visão geral, das Vendas e das telas de inventário
e venda em tamanho de celular, para conferir o visual depois de mexer no
front. Roda depois do `e2e`, que deixa o banco com dados de exemplo.

### `src/frontend-e2e.mjs` — o painel novo num navegador de verdade
**33 asserções · ~5 s · Playwright + servidor HTTP + build do frontend**

Prova o painel React/TypeScript sobre o mesmo backend:

1. o app abre **já conectado** — a conexão do painel legado é reaproveitada
   (mesma chave de `localStorage`, mesmo formato);
2. a tela Nuvemshop lê o estado real e mostra os números certos;
3. com a sincronização de pé, o estado diz "Sincronizando normalmente";
4. **divergência de estoque NÃO aparece como pendência** enquanto a
   sincronização estiver de pé — a rodada seguinte conserta sozinha, e
   listar isso como tarefa de alguém é o que faz o painel parecer sempre em
   chamas;
5. o que precisa de gente aparece em Pendências, com o motivo;
6. *Analisar sincronização* roda a rodada seca e mostra o diff classificado
   por risco;
7. **e não escreve nada na Nuvemshop** — a loja falsa registra tudo que
   recebe, e a contagem de escritas continua zero depois da análise inteira;
8. a aba Reconciliação recebe a mesma análise e diz que aprovar e aplicar
   ainda não existem;
9. **com a sincronização QUEBRADA (a loja falsa forçada a responder 500), a
   MESMA divergência vira a pendência mais séria da tela**, em primeiro
   lugar, carregando a mensagem que o servidor deu — não um texto genérico.
   É o teste de ponta a ponta do diagnóstico descrito em
   [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md);
10. o rodapé continua apontando para o painel legado;
11. nenhum erro de console.

Precisa do build pronto: `cd frontend && npm run build`.

### Testes unitários do frontend
**73 testes · Vitest · sem navegador**

```bash
cd frontend && npm test
```

Cobrem lógica pura e a camada de API, não aparência:

| Arquivo | O que prova |
|---|---|
| `src/features/nuvemshop/panorama.test.ts` | O porte de `panoramaLoja()` é fiel: divergência, falta cadastrar, oculto com peça, estoque negativo virando zero, produto sem preço não inventando R$ 0, e códigos que a rodada não empurra ficando fora de "estoque errado". E os **dois sentidos** da regra de divergência: o mesmo panorama conta 0 ou 2 pendências conforme a sincronização esteja de pé ou não |
| `src/features/nuvemshop/saude.test.ts` | O diagnóstico da sincronização: os sete estados, as bordas exatas dos dois limites (26 h de atraso, 1 h travada), a precedência entre eles, o timestamp do SQLite lido como UTC e não como hora local, e data ilegível **não** virando atraso silencioso |
| `src/features/reconciliacao/classificar.test.ts` | A classificação de risco, inclusive a assimetria deliberada (tirar do ar é pior que colocar à venda), a ordenação por atenção e a extração do nome da variação |
| `src/services/client.test.ts` | Bearer em toda chamada, mensagem de erro vinda do servidor, 401 marcado, falha de rede virando status 0, abortar não sendo erro, conexão no formato do painel legado |
| `src/services/sync.test.ts` | **`analisar` sempre manda `seco:true` e nunca manda `forcar`** — este frontend não escreve na loja |

Sem `jsdom` e sem `@testing-library` de propósito: aparência se prova no
navegador de verdade, não em DOM simulado.

### `src/dry-run-test.mjs` — o que a rodada seca escreve e o que não escreve
**49 asserções · ~15 s · precisa da loja falsa (ele mesmo a sobe)**

O teste mais paranoico da suíte, e o único que **lê o SQLite direto** em vez
de perguntar à API. Ele fotografa oito tabelas linha por linha antes e depois
de `POST /api/sync {"seco": true}`, e compara:

`produtos` · `movimentos` · `vendas` · `venda_itens` · `produto_variacoes` ·
`config` · `loja_snapshot` · `sync_execucoes` — mais o contador de escritas
da loja falsa.

Quatro seções:

0. **uma rodada real primeiro.** Foto de banco vazio não prova nada: "não
   mudou" seria verdade por falta de conteúdo.
1. **a rodada seca com trabalho de verdade esperando** — um pedido novo e
   estoque mexido na loja. Ela CONTA a venda e CALCULA as mudanças (provado),
   e mesmo assim não toca em saldo, razão, vendas nem na Nuvemshop.
   As colunas-espelho e o registro da execução, essas sim, mudam — e cada uma
   está afirmada explicitamente.
2. **rodar seco duas vezes é inofensivo**, inclusive `produto_variacoes`,
   que é apagada e regravada com o mesmo conteúdo.
3. **o freio pausa a rodada seca igual à real** — a checagem vem antes do
   `if (seco) return`, e é o que permite descobrir que a rodada travaria sem
   arriscar a loja.
4. **a rodada REAL, essa sim, escreve.** O contraste que fecha a prova: sem
   este bloco, todos os "não mudou" acima poderiam ser verdade por acidente.

A tabela do que muda e do que não muda está em
[SYNC_ENGINE.md](SYNC_ENGINE.md).

> Ele lê `api/.wrangler/state/.../*.sqlite` em modo somente-leitura, com o
> Worker no ar. SQLite aceita vários leitores; nada aqui escreve.

### `src/saude-sync-test.mjs` — uma análise nunca esconde uma falha real
**25 asserções · ~10 s · precisa da loja falsa (ele mesmo a sobe)**

Prova a correção do TECH_DEBT.md item 12: `resumoSync` responde a saúde
operacional a partir da última execução REAL, nunca de uma seca.

Quatro cenários, usando `loja.estado.falhar = true` (a loja falsa responde
500 em tudo) para forçar uma falha de verdade:

1. sync real falha → dry-run passa → a saúde **continua** `erro`;
2. sync real ok → dry-run ok → a saúde continua `ok`, sem mudança;
3. sync real pausada pelo freio → dry-run também pausa → a saúde **continua**
   `pausado`;
4. o caso simétrico: uma ANÁLISE que falha não pode contaminar uma
   sincronização real saudável.

Cada cenário confere `ultimaId` continua apontando para a execução real, não
para a seca — e `ultimaAnaliseEm` (quando a última análise rodou) fica
separado de `ultimaEm` (quando a última sincronização real terminou).

### `src/reconciliacao-schema-test.mjs` — o schema do motor de reconciliação
**65 asserções · ~40 s · roda `wrangler d1 execute` direto, SEM subir o
Worker, num banco descartável (`--persist-to` numa pasta temporária)**

O único teste da suíte que fala com o D1 local sem passar pelo Worker. Prova,
nessa ordem:

1. a migration aplica sobre o schema de **produção antes desta fase**
   (`git show f3f08cb:api/schema.sql` — reproduzível por qualquer clone, ao
   contrário de um dump de backup);
2. as duas tabelas, todas as colunas (inclusive a gerada,
   `variacao_chave` — que `pragma_table_info` omite; precisa de
   `pragma_table_xinfo`) e os cinco índices nascem certos;
3. nenhuma das 16 tabelas antigas some, e um produto+movimento inseridos
   ANTES da migration continuam intactos depois;
4. a unicidade `(sessao_id, sku, variacao_chave, tipo)` rejeita duplicata —
   inclusive com `variacao IS NULL` nos dois lados, e aceita variações
   diferentes do mesmo código;
5. no máximo uma sessão `revisao` por origem;
6. os `CHECK` de status/tipo/risco/origem aceitam o válido e recusam o
   inventado;
7. `migracao-reconciliacao.sql` roda duas vezes sem erro (tudo
   `IF NOT EXISTS`); `migracao-sync-seco.sql` roda uma segunda vez e
   **falha**, e isso é o esperado — mesmo padrão de `migracao-variacoes.sql`.

Detalhe completo do schema em
[RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md).

### `src/reconciliacao-test.mjs` — o Apply do motor de reconciliação
**143 asserções · ~35 s · precisa da loja falsa (ele mesmo a sobe) e do
Worker no ar**

Prova o backend do fluxo Review → Apply (`api/src/reconciliacao.js`) para
as três origens — `nuvemshop`, `planilha_estoque_total`,
`planilha_produtos_novos` — tudo por HTTP contra o Worker local:

1. fluxo feliz sem variação e com variação (endereça só a variante certa,
   a irmã não é tocada);
2. Precondition A (destino): a loja muda por fora entre a análise e o
   apply → item `obsoleto`, **nenhum PATCH** é enviado;
3. Precondition B (origem): uma venda interna muda o nosso saldo entre a
   análise e o apply, a loja NÃO muda → a precondition A sozinha passaria,
   mas a B pega → `obsoleto`, sem escrita;
4. **recuperação de PATCH** (4b/4c): destino já é `para` e a origem
   continua batendo com `base_json` → confirma `aplicado` **sem reenviar o
   PATCH** (simula "o PATCH de uma tentativa anterior chegou, mas o Worker
   morreu antes de gravar o status"); destino já é `para` MAS a origem
   mudou → não conclui aplicado por coincidência, vira `obsoleto`;
5. dupla aplicação: a segunda chamada numa sessão já TERMINADA é sempre
   recusada (409), zero efeito colateral;
6. duas chamadas simultâneas (6/6b/6c): desde a retomada de sessão (item
   10 abaixo), a rota aceita reentrar numa sessão `aplicando` — então duas
   chamadas concorrentes não são mais "uma vence, a outra 409 sempre"; o
   que o teste prova é o que importa de verdade, que nenhuma quebra (nunca
   500) e o efeito final nunca duplica: em `estoque_loja` porque o PATCH é
   absoluto (mais de um PATCH pode sair, mas todos concordam no mesmo
   valor), em `ajuste_qtd` porque o índice único em
   `movimentos.reconciliacao_item_id` barra fisicamente um segundo
   movimento — e 6c prova isso direto no D1 local, sem depender de duas
   chamadas conseguirem se entrelaçar de verdade (o `wrangler dev --local`
   roda num processo só, e nem sempre entrelaça);
7. falha técnica do PATCH (`loja.estado.falharPatchParaProduto`) → item
   `erro`, sessão `aplicada_parcial` (nunca `erro` de sessão — o Apply
   terminou de contabilizar);
8. mistura: um item aplica, um fica obsoleto, um dá erro, tudo na mesma
   sessão → `aplicada_parcial`;
9. item rejeitado nunca é tocado; item pendente (nunca decidido) fica de
   fora do apply sem precisar de decisão implícita;
10. `ajuste_qtd`: um único movimento por aplicação, mesmo pedindo apply
    duas vezes — a razão continua fechando depois;
11. o código do módulo nunca usa `forcar` fora de comentário (checagem
    estática do próprio arquivo);
12. sessão nova supera a antiga da mesma origem ainda em revisão; aplicar
    sem item aprovado é recusado; cancelar uma sessão em revisão funciona e
    ela para de aceitar decisão ou apply;
13. **retomada de sessão presa em `aplicando`** (cenário 16): uma sessão é
    inserida direto no D1 já com status `aplicando` — um item já
    `aplicado` (simulando uma execução anterior que morreu DEPOIS de
    aplicar esse item mas ANTES de fechar a sessão) e outro ainda
    `aprovado`. Chamar `/aplicar` de novo ignora o primeiro (nenhum PATCH
    novo para ele) e processa o segundo — a sessão fecha `aplicada`
    corretamente;
14. **planilha Estoque Total** (17–21): igual não vira item; aumentar e
    diminuir viram `ajuste_qtd` com `de`/`para` corretos; SKU da planilha
    ausente do catálogo não cria produto, só conta em `resumo.novos`;
    preview obsoleto (estoque mudou depois da análise) → `obsoleto`; total
    proposto menor que o consignado com revendedoras → conflito
    (`risco: 'desconhecido'`, `dados.conflito: 'total_menor_que_consignado'`)
    que o Apply recusa MESMO SE aprovado; concorrência real no mesmo item
    nunca duplica movimento;
15. **planilha Produtos Novos** (22–25): SKU novo vira item e é criado; SKU
    existente é ignorado por completo — mesmo com descrição/categoria/
    preço/quantidade diferentes na planilha, o produto sai byte a byte
    igual; mistura de 10 linhas com 3 novas gera exatamente 3 candidatos;
    SKU criado por outro caminho entre a análise e o apply não é
    sobrescrito (`obsoleto`); retry/concorrência nunca cria duas vezes;
16. a razão (`produtos.qtd == SUM(movimentos.qtd)`) fecha depois de todos
    os fluxos acima rodarem na mesma sessão de teste.

Os cenários de concorrência para `ajuste_qtd` (6b, 6c) e o de retomada
(16) inserem sessão/item **direto** no mesmo SQLite que o Worker já está
usando (`wrangler d1 execute --local`, sem `--persist-to`, no diretório
`api/`) para isolar a corrida do resto do fluxo — a partir da aprovação, é
tudo API, igual a qualquer outro item. A sessão de retomada nasce
`aplicando` direto no banco porque não existe (nem deveria existir) uma
rota HTTP para "travar" uma sessão no meio — isso só acontece de verdade
quando o Worker morre.

Detalhe do fluxo completo, das preconditions e da idempotência em
[RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md).

### `api/test-api.mjs`
Script auxiliar de chamada à API. Não faz parte da suíte.

### `src/pacote-vendas-test.mjs` — pagamento, saídas, garantia, troca e o dia
**182 asserções · ~35 s · precisa do Worker local e do banco limpo**

O pacote de §30 a §35, cenário a cenário. Cada seção começa dizendo o
DEFEITO que ela existe para impedir de voltar — um teste que só afirma o
comportamento certo não explica por que ele importa.

1. **A** — venda de 15/07 paga em 04/09: a série mensal põe a **venda** em
   julho e o **dinheiro** em setembro. Se as duas caíssem na mesma chave, a
   separação de §30 não estaria valendo em lugar nenhum;
2. **B** — venda não paga é A Receber e faturamento zero; marcada paga,
   entra pela data do pagamento. Pagar duas vezes é 409 e o faturamento não
   dobra;
3. **C** — preço de tabela 89, negociado 79: o item vale 79, `preco_tabela`
   fica 89, o desconto é derivado, e o **catálogo não muda**. Preço diferente
   sem motivo é recusado;
4. **D · E · F** — brinde, uso próprio e diferença de inventário: estoque
   baixa, e faturamento, vendas, peças, clientes, ticket médio e ranking
   ficam **idênticos**. Saída sem explicação nenhuma é recusada. Só a
   diferença de inventário pode somar peça;
5. **G** — garantia: a venda original continua com o total e os itens dela,
   o estoque comercial **não** é incrementado, o faturamento não muda, e a
   mesma peça não abre duas garantias em aberto. Aparece em "Peças em
   reparo" com prazo calculado;
6. **H** — troca 89 → 99: a peça nova sai do estoque, a defeituosa **não**
   volta, faturamento imediato **zero**, diferença 10 a receber. Paga, o
   faturamento sobe **exatamente 10** — nunca 99 — e a contagem de vendas
   não se move. Pagar duas vezes é 409;
7. **H.2** — troca mais barata: o sistema registra e **para**, com
   `pendente_regra` e aviso. Crédito/reembolso não é regra definida;
8. **I** — editar a cliente: mesmo `cliente_id`, mesmo faturamento, mesmas
   compras, abrindo por id **e** pelo nome novo;
9. **I.2** — nome ambíguo: a edição funciona, o amarre **não** acontece, e o
   sistema diz por quê. §2 aplicado a dinheiro;
10. **J** — o dia 28/08 traz venda, saída sem faturamento e o resto, cada
    linha com origem, sem duplicata, e o que foi pago em outro dia **não**
    conta no caixa daquele dia;
11. **K** — estorno de brinde: estoque restaurado, linha preservada e
    marcada, estorno sem motivo recusado, segundo estorno recusado;
12. **L · L.2** — a auditoria histórica é **seca**, anuncia o que não faz, e
    **"ACHO QUE FOI VENDIDO" sai com confiança baixa mesmo com o nome
    dizendo "Inventário"**: a dúvida da linha rebaixa qualquer certeza.
    Aplicar não apaga linha e não toca estoque; o faturamento cai
    exatamente o que o relatório previu; desfazer devolve o valor;
13. **M** — a razão contábil fecha depois de tudo, e nenhum saldo é negativo.

### `src/pacote-vendas-ui-test.mjs` — as telas do pacote, num navegador
**59 asserções · ~60 s · Playwright + servidor HTTP em `localhost:8000`**

O teste de API prova as regras; este prova que elas **chegam à tela**. A
distinção importa: o defeito do "Editar dados" era exatamente isso — regra
certa que não voltava para a ficha.

1. a sub-aba "Saídas sem faturamento" existe, navega, e a lista mostra o que
   foi registrado;
2. registrar pela tela baixa o estoque e **não move** faturamento nem
   contagem de vendas;
3. estornar devolve a peça e a linha continua, marcada;
4. o modal de fechar venda tem **observação** e **PAGO / NÃO PAGO**, e diz
   para qual data o dinheiro vai **antes** de confirmar;
5. a venda não paga aparece como **A RECEBER**, com o botão de marcar o
   pagamento, e o dia mostra o bloco "Também aconteceu em…";
6. o Painel mostra **Peças em reparo** com dias úteis decorridos e
   restantes, e diz que sábado e domingo não contam;
7. o perfil abre garantia **por item**, já sabendo de qual peça é e quanto
   ela pagou, e mostra a linha do tempo embaixo do item;
8. editar a cliente volta para a **ficha dela**, com o nome novo, a
   observação salva, o histórico inteiro e o mesmo `cliente_id`;
9. 390px sem rolagem horizontal em Lançamentos, Saídas e Painel;
10. console limpo.

## Como rodar

### Linux / macOS

```bash
src/reset-e-testar.sh          # zera o banco, sobe tudo e roda o e2e
node src/sync-test.mjs         # com banco limpo e Worker no ar
node src/variacoes-test.mjs
node src/kits-test.mjs
node src/frontend-e2e.mjs      # precisa de `cd frontend && npm run build` antes
node src/dry-run-test.mjs      # a prova formal do dry-run
node src/saude-sync-test.mjs   # análise nunca esconde falha real
node src/corte-pedidos-test.mjs # pedido antigo não vira venda nova
node src/reconciliacao-test.mjs # o Apply do motor de reconciliação
node src/vendas-reconstrucao-test.mjs  # a regra: linha vira venda (puro)
node src/categoria-nome-test.mjs      # categoria não é material (puro)
node src/vendas-historico-test.mjs   # histórico entra sem mover estoque
node src/revendedora-nao-e-cliente-test.mjs  # revendedora sai do CRM (puro)
node src/trocar-planilha-test.mjs    # trocar a planilha não soma duas versões
node src/venda-desconto-test.mjs     # desconto por peça na venda de balcão
node src/erro-detalhe-test.mjs       # a tela mostra a causa, não "Falha interna"

# navegador (precisa de `python -m http.server 8000` na raiz)
PW_CHROMIUM=/caminho/do/chrome node src/vendas-clientes-ui-test.mjs

cd frontend && npm test        # os 73 testes unitários, sem navegador

# este não precisa do Worker no ar — fala com o D1 local direto
node src/reconciliacao-schema-test.mjs
```

### Windows

`src/reset-e-testar.sh` **não roda no Windows**: usa `setsid` (ausente no
Git Bash) e um `pkill` que não alcança o processo do Wrangler. Os três
testes de API rodam normalmente desde que o ciclo seja feito à mão:

```bash
# 1. derrubar o Worker (ele segura o arquivo do SQLite)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*wrangler*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }; Get-Process workerd -EA SilentlyContinue | Stop-Process -Force"

# 2. zerar o banco e recriar o schema
cd api && rm -rf .wrangler/state
npx wrangler d1 execute DB --local --file=schema.sql

# 3. subir o Worker e esperar o /api/health responder
npx wrangler dev --local --port 8787 &

# 4. rodar UM teste
node ../src/sync-test.mjs
```

Repita os passos 1–4 para cada teste: banco limpo é requisito, não capricho.

## Limitações conhecidas do ambiente

### `vendas-clientes-ui-test.mjs` precisa de uma base com histórico

Cinco asserções dele não têm o que verificar num banco recém-criado:

- **paginação da lista de clientes** — o limiar é 48 cadastros; com menos, o
  rodapé "Mostrando X de Y" corretamente não aparece;
- **"revendedora sai do ranking de clientes"** (3 asserções) — depende de
  `historico_operacoes.papel = 'acerto'`, que só existe depois de um lote da
  planilha importado e reconstruído. Numa base só com vendas de balcão,
  cadastrar alguém como revendedora não reclassifica venda nenhuma, e esse é
  o comportamento certo.

Não é regressão: é o teste rodando fora do ambiente para o qual foi escrito.
Rode-o contra o DEV publicado, ou semeie um lote histórico antes.


| Limitação | Efeito | Situação |
|---|---|---|
| `executablePath` fixo em `/opt/pw-browsers/chromium` | Os testes de navegador só rodavam no Linux | **Resolvido**: os três honram `PW_CHROMIUM` e, sem ela, usam o Chromium do Playwright |
| CORS derruba o `e2e` na tela de conexão | O navegador vem de `localhost:8000`, e o `wrangler.toml` libera só o endereço de produção | **Resolvido pelo ambiente**: `ORIGENS_PERMITIDAS=http://localhost:8000` no `.dev.vars` |
| `reset-e-testar.sh` usa `setsid` e `pkill` | Não roda no Windows | **Aberto** — [TECH_DEBT.md](TECH_DEBT.md) item 4 |
| `execFileSync('npx', …, {shell:true})` dentro do teste | `reconciliacao-test` e `reconciliacao-schema-test` morrem com `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94` (Node v24.19.0 no Windows) | **Aberto** — reproduzido em 2026-08-23, ver [BASELINE.md](BASELINE.md) |
| `npm run build` chama `python3` | Falha no Windows, onde o comando é `python` | **Aberto** — item 6 |
| Cada teste exige reset manual do banco | Não dá para rodar a suíte inteira num comando | **Aberto** — item 4 |

O `wrangler dev` segura o arquivo do SQLite: derrube o processo **antes** de
apagar `.wrangler/state`, ou o `rm` falha com `Device or resource busy`.

## O que a suíte **não** cobre

- `comissao.js` — as faixas do acerto não têm teste próprio; só passam pelo
  caminho do `e2e`;
- `inventario.js` — coberto de raspão pelo `e2e` e pelo `kits-test`;
- rotas de revendedora, cliente e categoria fora do caminho do `e2e`;
- comportamento contra a Nuvemshop **de verdade** (por definição: a loja
  falsa imita o que se sabe que ela faz);
- concorrência: duas rodadas de sincronização ao mesmo tempo;
- o tipo `campo` do motor de reconciliação — nenhuma origem o gera ainda,
  e o Apply não sabe executá-lo; um item desse tipo vira `erro`
  explicitamente (nunca aplica por aproximação). `estoque_loja`,
  `ajuste_qtd` e `produto_novo` já têm gerador e execução. Ver
  [RECONCILIATION_ENGINE.md](RECONCILIATION_ENGINE.md);
- a tela de revisão/aprovação do motor de reconciliação — o backend
  (`api/src/reconciliacao.js`, `src/reconciliacao-test.mjs`) existe; a
  integração com o painel React ainda não.

## Baseline atual

A medição mais recente é a de **2026-08-23** (véspera da publicação do
go-live): **1.046 asserções, 0 falhas, 26 de 26 testes rodados**, mais 187
testes unitários do frontend. Dois testes não rodaram por limitação de
ambiente, com o motivo e o comando para rodá-los à mão. As medições
anteriores (2026-08-22 e 2026-08-18) continuam no arquivo, para comparação:
[BASELINE.md](BASELINE.md).
