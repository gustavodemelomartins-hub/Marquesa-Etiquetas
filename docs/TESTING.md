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
