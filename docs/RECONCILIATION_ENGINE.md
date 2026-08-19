# Motor de reconciliação

Schema em [api/migracao-reconciliacao.sql](../api/migracao-reconciliacao.sql)
+ [api/migracao-idempotencia-reconciliacao.sql](../api/migracao-idempotencia-reconciliacao.sql)
(espelhadas em [api/schema.sql](../api/schema.sql)) · **ainda NÃO aplicadas
em banco nenhum de produção** — só no D1 local, e só dentro dos testes. O
backend do fluxo Review → Apply já existe para três origens —
`nuvemshop`, `planilha_estoque_total`, `planilha_produtos_novos`
(`api/src/reconciliacao.js` + as rotas `/api/reconciliacao*` em
`api/src/index.js`), provado por `src/reconciliacao-test.mjs`. O que falta é
a integração com o painel React — ver
[ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md).

Este documento explica o fluxo completo. Foi escrito assim desde antes do
Apply existir, porque o schema precisava ser desenhado para ele inteiro —
decidir a forma das tabelas sem saber onde a última etapa ia doer teria
significado refazer schema depois.

## Fonte da verdade — TEMPORÁRIA

Regra de negócio formalizada em 2026-08-18 (ver `api/REGRAS.md` §
"Regra de negócio recém-formalizada"): enquanto o inventário físico não for
controlado definitivamente pelo sistema, **a planilha de Estoque Total
mantida pela Stéfane é a fonte máxima da verdade para a quantidade FÍSICA
TOTAL de cada SKU** — casa mais o que está com revendedoras. Corresponde a
`produtos.qtd`, e a NADA mais:

```
QUANTIDADE FÍSICA TOTAL POR SKU   → planilha Estoque Total (produtos.qtd)
DISTRIBUIÇÃO casa × revendedoras  → sistema (maletas / consignação)
MOVIMENTOS E HISTÓRICO            → sistema (movimentos, sempre a razão)
ESTOQUE DISPONÍVEL P/ NUVEMSHOP   → sistema, DERIVADO: total − consignado
CADASTRO E VARIAÇÕES DA LOJA      → Nuvemshop
```

A planilha não generaliza para "fonte de tudo" — ela não autoriza mexer em
maleta (§ Consignação abaixo) nem decide o que a Nuvemshop publica. E esta
prioridade é temporária por definição: quando o inventário interno for
controlado com confiança suficiente, ele poderá substituir a planilha como
fonte da verdade física. Não é regra eterna — ver
[DATA_MODEL.md § Fonte da verdade do físico](DATA_MODEL.md).

## Três origens, um motor

```
                    ┌─ nuvemshop                  (sync.js, seco)
                    │
RECONCILIAÇÃO  ←────┼─ planilha_estoque_total      (produtos.qtd)
                    │
                    └─ planilha_produtos_novos     (só cria SKU novo)

Todas: analisar → gerar itens → classificar → revisar → aprovar
       → aplicar → validar → auditar
```

As regras de GERAÇÃO e de APPLY mudam conforme a origem — o que cada uma
lê, como calcula `de`/`para`/`base_json`, o que sabe executar. Sessão,
itens, máquina de estados, auditoria, preconditions e idempotência são os
MESMOS para as três: um `criarSessaoComItens` compartilhado grava a sessão
e os itens; `aplicarSessao`/`executarAprovados` são o único Apply, que
despacha por `item.tipo` (`estoque_loja`, `ajuste_qtd`, `produto_novo`).
Não existem três motores — existem três geradores e um motor.

## Endpoints

Todos exigem o `Authorization: Bearer` de sempre. Nenhum aceita nem entende
`forcar` — esse freio é do `/api/sync` antigo, e o motor de reconciliação
existe para substituí-lo, não para herdar o atalho.

| Rota | O que faz |
|---|---|
| `POST /api/reconciliacao` | Origem `nuvemshop`: roda `POST /api/sync {"seco":true}` por baixo e congela o resultado numa sessão nova |
| `POST /api/reconciliacao/planilha/estoque-total/analisar` | Origem `planilha_estoque_total`: recebe `{"produtos":[...]}` já normalizado (mesmo formato de `POST /api/produtos/importar`), compara com `produtos.qtd`, congela a sessão. **Nunca escreve** |
| `POST /api/reconciliacao/planilha/produtos-novos/analisar` | Origem `planilha_produtos_novos`: mesmo formato de entrada; só SKU inexistente vira item — SKU existente é ignorado antes de qualquer outro processamento |
| `GET /api/reconciliacao/:id` | Sessão inteira: status, itens (com `dados` estruturado — ver § Conflitos estruturados), resumo, relato |
| `POST /api/reconciliacao/:id/itens/:itemId/aprovar` | `pendente → aprovado` (compare-and-set) |
| `POST /api/reconciliacao/:id/itens/:itemId/rejeitar` | `pendente → rejeitado` (compare-and-set) |
| `POST /api/reconciliacao/:id/cancelar` | `revisao → cancelada` |
| `POST /api/reconciliacao/:id/aplicar` | Aplica só os itens `aprovado`, qualquer que seja a origem da sessão. Se a sessão já estiver `aplicando` (um Apply anterior não terminou — ex.: o Worker morreu no meio), RETOMA em vez de recusar. Ver § Sessão `aplicando` |

As três origens de análise convergem nos mesmos cinco endpoints de
Review/Apply — nenhuma rota nova por origem além das duas de análise, que
existem porque a ENTRADA (uma planilha vs. uma rodada de sync) é
genuinamente diferente.

## Por que existe

Hoje a sincronização e a importação **decidem e aplicam no mesmo ato**. A
prévia existe (`POST /api/sync {"seco": true}`), mas é um desvio de
comportamento, não o caminho principal — e a única proteção contra um erro
em massa é um freio que conta quantos produtos mudariam
([TECH_DEBT.md](TECH_DEBT.md) item 8). O importador de planilha
(`POST /api/produtos/importar`) tem o mesmo problema, mais grave: ele
GRAVA no mesmo ato que lê, sem sessão nenhuma no meio.

O motor de reconciliação separa "descobri o que mudaria" de "mudei" em duas
etapas com um registro entre elas, para que aprovar deixe de ser instantâneo
com aplicar — para as três origens, não só a Nuvemshop.

## O fluxo

```
Preview                  cada origem lê do jeito dela (sync seco, ou a
                          planilha já normalizada) — NENHUMA escreve
      ↓
Sessão congelada          INSERT reconciliacao_sessoes (status='revisao')
                           INSERT reconciliacao_itens, um por mudança —
                           cada um leva `de`, `para` e `base_json`
      ↓
Revisão                   uma pessoa olha a lista, agrupada por risco
      ↓
Aprovação                 status do item: pendente → aprovado | rejeitado
      ↓
Precondition DESTINO      o valor observado lá fora ainda é `de`?
  +
Precondition ORIGEM       o estado daqui que produziu `para` ainda é
                           `base_json`?
      ↓
Apply                     as DUAS preconditions têm de passar. Uma falhando
                           → status='obsoleto', nunca escreve.
                           Escrita falhando depois de passar nas duas
                           → status='erro'.
                           Escrita certa → status='aplicado', e passa por
                           estoque.js › movimentar como qualquer mudança
      ↓
Validação                  produtos.qtd == SUM(movimentos.qtd) continua
                           valendo — a mesma conferência de sempre
      ↓
Auditoria                  reconciliacao_sessoes.relato_json: quem foi
                           aplicado, quem ficou obsoleto, quem deu erro
```

O Apply sabe EXECUTAR `estoque_loja` (nuvemshop), `ajuste_qtd`
(planilha_estoque_total) e `produto_novo` — este último só quando a
sessão é `planilha_produtos_novos`, checado explicitamente no despacho, não
só por convenção de quem gera cada tipo. Um item `campo` aprovado vira
`erro` explícito, nunca aplica por aproximação (§9 do CLAUDE.md: "o que o
sistema decide não fazer é anunciado, nunca engolido") — `campo` não tem
gerador nem execução ainda.

## `de`, `para`, `base_json` — o que cada um responde

Confundir os três é o erro mais fácil de cometer lendo este schema, porque
os três parecem a mesma coisa ("um valor relacionado à mudança"). Não são.

| Coluna | Responde | Exemplo (estoque_loja) |
|---|---|---|
| `de` | O que o **destino** mostrava na hora da análise | "a Nuvemshop dizia 10" |
| `para` | O que a proposta quer escrever | "deveria dizer 8" |
| `base_json` | O que, **daqui**, produziu esse `para` | `{"qtd_total": 8, "consignado": 0, "casa": 8}` |

`de` e `para` sozinhos respondem "o que muda". `base_json` responde uma
pergunta diferente: **"o `para` continua certo?"** — porque o `para` de
`estoque_loja` não é um número fixo, é o RESULTADO de uma conta feita com
dado nosso, que pode ter mudado desde a análise (uma venda, uma maleta
aberta, um kit que perdeu peça).

### Por tipo

| `tipo` | `base_json` | Por quê |
|---|---|---|
| `estoque_loja`, código sem variação | `{"qtd_total": N, "consignado": N, "casa": N}` | `qtd_total = produtos.qtd`; `consignado` = soma de `maleta_itens` em maletas abertas/em_acerto; `casa = qtd_total − consignado` (o valor antes do `max(0, …)` de `empurrarEstoque`) |
| `estoque_loja`, é KIT | `{"disponivel_kit": N}` | `saldosDoSku(kit).disponivel` — o mínimo entre componentes, já calculado. Um kit nunca tem saldo próprio |
| `estoque_loja`, uma variação | `{"saldo_variacao": N}` | `SUM(movimentos.qtd) WHERE sku=X AND variacao=Y` |
| `produto_novo` | `NULL` | A origem é a linha da planilha, congelada em `dados_json`. Nada externo pode deixá-la obsoleta sozinha |
| `ajuste_qtd` | `NULL` | Mesma razão. `de` (via precondition A) já cobre a deriva possível: se `produtos.qtd` mudou desde a análise, a precondition A pega |
| `campo` | `NULL` | Idem — descrição/categoria/preço vêm do arquivo, não de um cálculo volátil |

`estoque_loja` é o único tipo com `base_json` não-nulo porque é o único caso
em que **duas fontes independentes** determinam a proposta: a loja (externa,
é o `de`) e o nosso saldo (interno, é o `base_json`). Os outros três tipos
têm uma fonte só — o arquivo importado — e ela não muda sozinha.

`ajuste_qtd` tem uma checagem A MAIS, fora do par `de`/`base_json`: nunca
deixar o total proposto (`para`) abaixo do que já está consignado com
revendedoras — ver § Consignação nunca quebrada, abaixo. Não é
`base_json` porque não é "o estado que gerou o `para`", é uma restrição
que vale para QUALQUER `para`, gerado por qualquer origem.

## As duas preconditions

```
Precondition A (destino)    valor ATUAL no destino  ==  de
Precondition B (origem)     estado ATUAL que produziria `para`  ==  base_json
```

**As duas.** Uma sozinha não basta — é o cenário do pedido original:

```
prévia:     a loja mostra 10, temos 8 em casa.   de=10  para=8
no meio:    vendem-se 5 peças. em casa passa a ter 3.
aplicação:  confere `de` → a loja continua com 10. Bate. Aplica.
resultado:  a loja anuncia 8. Existem 3.
```

A precondition A sozinha passa porque ninguém mexeu na Nuvemshop entre a
análise e a aplicação. O que mudou foi o lado de CÁ — e é exatamente o que a
precondition B pega: `base_json.casa` era 8, o `casa` recalculado na hora do
Apply já não é.

Se **qualquer uma** das duas não bater, o item vira `status = 'obsoleto'` e
**não escreve nada**. Não tenta recalcular e aplicar por aproximação — volta
para revisão humana numa sessão nova. É a regra 2 do `CLAUDE.md` ("não sabe
qual aro saiu? não escreva") estendida para a aplicação em massa.

## Máquina de estados

### Sessão (`reconciliacao_sessoes.status`)

```
revisao   ──┬──► aplicando ──┬──► aplicada
            │                ├──► aplicada_parcial
            │                └──► erro
            ├──► cancelada
            └──► superada
```

| Estado | Significa |
|---|---|
| `revisao` | Nasce aqui. Esperando decisão humana sobre os itens |
| `aplicando` | O Apply está em andamento (transitório) |
| `aplicada` | Todo item aprovado foi escrito com sucesso |
| `aplicada_parcial` | Pelo menos um item aprovado ficou `obsoleto` ou deu `erro` |
| `cancelada` | Encerrada sem aplicar nada, por decisão humana |
| `superada` | Uma sessão mais nova da MESMA origem nasceu antes desta ser decidida |
| `erro` | O Apply foi interrompido por falha catastrófica, antes de terminar de contabilizar o que conseguiu fazer |

`aplicada_parcial` existe porque `aplicada` sozinho não distingue "tudo
certo" de "metade ficou obsoleta" — a mesma ambiguidade que o `TODO` de
`vendas.cancelada` já resolve com um campo dedicado em vez de sobrecarregar
`status`.

### Item (`reconciliacao_itens.status`)

```
pendente ──┬──► aprovado ──┬──► aplicado
           │                ├──► obsoleto
           │                └──► erro
           └──► rejeitado
```

`obsoleto` × `erro` é a distinção que protege peça física, pedida
explicitamente na revisão deste schema:

| | `obsoleto` | `erro` |
|---|---|---|
| O que houve | O mundo mudou desde a análise — a precondition A OU B não bateu | As duas preconditions bateram, mas a ESCRITA em si falhou (rede, Nuvemshop fora do ar, D1 indisponível) |
| É concorrência? | Sim | Não |
| A proposta continuava válida? | Não — o `para` já não é o certo | Sim — só a tentativa de escrever falhou |
| Reaplica sozinho? | **Nunca.** Só numa sessão nova, com um `para` recalculado | Pode ser retentado com o MESMO `para` — nada mudou |

Misturar os dois no mesmo status faria a tela tratar "a loja caiu por 2
segundos" e "alguém vendeu a peça enquanto você revisava" como o mesmo tipo
de problema, quando as respostas certas são opostas: um pede retentar, o
outro pede olhar de novo.

## Consignação nunca quebrada (`planilha_estoque_total`)

A planilha é verdade do TOTAL, mas não autoriza o sistema a apagar ou
redistribuir maleta silenciosamente. Antes de considerar um `ajuste_qtd`
aplicável, `analisarPlanilhaEstoqueTotal` calcula quanto daquele SKU está
consignado agora (`consignadoDoSku`) e compara com o `para` proposto:

```
para < consignado   →   TOTAL_MENOR_QUE_CONSIGNADO
                         risco = 'desconhecido' (o sistema genuinamente
                         não sabe qual dos dois números confiar)
                         dados.conflito = 'total_menor_que_consignado'
                         NÃO aplicável automaticamente
```

"Não aplicável automaticamente" é levado a sério: o item ainda é gerado
(visível, aprovável/rejeitável como qualquer outro — nunca engolido), mas
`checarPreconditionsInternas` refaz a MESMA conta no momento do Apply,
não só na análise. Se alguém aprovar o conflito mesmo assim, o Apply
recusa de novo (vira `obsoleto`) — a proteção não depende de a análise ter
avisado a tempo, nem de ninguém ter lido o aviso. Prova em
`src/reconciliacao-test.mjs`, cenário 20.

## Produtos novos — nunca sobrescreve existente (`planilha_produtos_novos`)

Objetivo único: criar SKU que ainda não existe. A checagem
`existentes.has(sku)` acontece ANTES de qualquer outro processamento da
linha — SKU já cadastrado nunca gera item, mesmo que quantidade,
descrição, preço ou categoria da planilha sejam diferentes do catálogo.
Estruturalmente incapaz de virar sincronização total por acidente: não
existe caminho de código, nesta origem, que leia ou escreva um campo de
produto existente. Prova em `src/reconciliacao-test.mjs`, cenário 22
(mistura de dados divergentes, catálogo intocado byte a byte).

Se o SKU passou a existir entre a análise e o Apply (por qualquer motivo
alheio a esta sessão), `checarPreconditionsInternas` recusa como
`obsoleto` antes de tentar criar — nunca sobrescreve o que apareceu.

## Unicidade — `(sessao_id, sku, variacao, tipo)`

Sem isso, a mesma proposta duas vezes na mesma sessão é possível: inofensivo
para `estoque_loja` (o PATCH manda valor absoluto — aplicar duas vezes dá o
mesmo resultado), mas para `ajuste_qtd` seria um **movimento contado duas
vezes** — a razão contábil quebrando por uma corrida de inserção, não por
erro de cálculo.

`variacao IS NULL` (o código inteiro, sem variação) precisa de cuidado
extra: o SQLite nunca considera dois `NULL` iguais dentro de um índice único
— cada `NULL` é distinto até de si mesmo. Um índice comum sobre `variacao`
deixaria passar dois itens do mesmo `sku`+`tipo`, os dois com `variacao
NULL`, como se fossem diferentes.

A solução, provada em `src/reconciliacao-schema-test.mjs`:

```sql
variacao_chave TEXT GENERATED ALWAYS AS (COALESCE(variacao, '')) STORED,
...
CREATE UNIQUE INDEX idx_rec_itens_unico
  ON reconciliacao_itens(sessao_id, sku, variacao_chave, tipo);
```

Uma coluna gerada só para a comparação, trocando `NULL` por `''`. A coluna
`variacao` continua `NULL` de verdade — o resto do sistema (`movimentos`,
`produto_variacoes`) já usa esse mesmo vocabulário, e mudar isso só para
esta tabela criaria uma segunda convenção.

`pragma_table_info` **não lista** colunas `GENERATED` — só
`pragma_table_xinfo` (com `hidden = 3`). Quem for inspecionar o schema por
código precisa saber disso; o teste de schema já usa a versão certa.

## Sessões concorrentes

**No máximo uma sessão `revisao` por origem, e o banco garante — não o
código:**

```sql
CREATE UNIQUE INDEX idx_rec_sessoes_revisao_unica
  ON reconciliacao_sessoes(origem) WHERE status = 'revisao';
```

Uma sessão nova marca a antiga como `superada` no MESMO `db.batch()` em que
se cria — atômico, sem lock distribuído. Duas abas tentando criar sessão ao
mesmo tempo: uma cria, a outra recebe erro de UNIQUE e tenta de novo (ou a
tela mostra "alguém já abriu uma revisão, veja essa").

**Por que não travar `aplicando` também:** duas aplicações concorrentes
poderiam, em teoria, mirar o mesmo SKU a partir de sessões diferentes. Mas a
defesa contra isso já existe e é melhor que um lock de sessão — são as
**preconditions por item**. Elas protegem no grão certo (o SKU específico
que está sendo escrito), não no grão da sessão inteira, que travaria itens
sem nenhuma relação entre si só porque nasceram na mesma revisão.

O índice é por `origem`, não global: as três origens podem ter uma sessão
`revisao` aberta cada uma, ao mesmo tempo — é exatamente o que os três
botões do frontend futuro (Nuvemshop, Estoque Total, Produtos Novos)
precisam. Preconditions por item continuam sendo a defesa se duas dessas
sessões, de origens diferentes, propuserem algo para o MESMO SKU.

## Idempotência interna — `ajuste_qtd`

Migration: [api/migracao-idempotencia-reconciliacao.sql](../api/migracao-idempotencia-reconciliacao.sql)
(espelhada em `api/schema.sql`/`api/schema-console.sql`, também ainda **não
aplicada em produção**). Adiciona `movimentos.reconciliacao_item_id`
(nullable, `REFERENCES reconciliacao_itens(id)`) e um índice único sobre
ela.

A pergunta que motivou isto: "e se a primeira tentativa morreu bem no meio —
item reivindicado, movimento ainda não gravado?" A versão anterior deste
motor reivindicava o item (CAS) ANTES de gravar o movimento, num passo
separado, porque um `db.batch()` do D1 não aborta condicionalmente no meio
(é tudo-ou-nada da transação inteira, não "desiste se a linha anterior não
mudou nada"). Isso deixava exatamente a janela que a pergunta descreve.

A correção: o `INSERT` do movimento, a atualização de `produtos.qtd`
(dentro de `estoque.js › movimentar`) e o `UPDATE` de status do item agora
entram no **MESMO `db.batch()`** — os três acontecem, ou nenhum acontece.
Não existe mais um instante em que um aconteceu e o outro não. Se o Worker
morre DURANTE o batch, o D1 não commitou nada; na retomada, o item continua
`aprovado` e o código roda de novo do zero.

O que resta proteger é OUTRA coisa: duas EXECUÇÕES diferentes (duas
chamadas de `/aplicar`, concorrentes ou uma retomada que chega enquanto
outra ainda está em andamento) disputando o MESMO item. A primeira a
commitar grava o movimento com `reconciliacao_item_id = <id do item>`. A
segunda tenta inserir outro movimento com o MESMO `reconciliacao_item_id`,
e o índice único recusa — não com um erro solto, mas com a garantia que o
D1 já dá de graça: **confirmado com o D1 local de verdade**
(`src/reconciliacao-test.mjs`, cenário 6c, faz o `INSERT` duplicado direto
no SQLite e prova que ele volta `UNIQUE constraint failed`). O código trata
essa falha como recuperação — não como erro técnico: confirma o item como
`aplicado` (o que já é verdade, gravado por quem venceu a corrida) e não
tenta de novo.

```
try:
  db.batch([INSERT movimento (reconciliacao_item_id=item.id), UPDATE produtos.qtd, UPDATE item→aplicado])
catch:
  se existe movimento com este reconciliacao_item_id → já foi outra execução: confirma aplicado, não é erro
  senão → falha de verdade (D1 indisponível): marca erro, nada foi commitado, retomada futura pode tentar de novo
```

### `produto_novo` — a mesma ideia, chave diferente

`produto_novo` (só `planilha_produtos_novos`) segue o mesmo desenho —
`INSERT produtos` + movimento `entrada` (se houver quantidade inicial) +
`UPDATE` do item, tudo no mesmo `db.batch()` — mas não precisou de índice
novo nenhum: `produtos.sku` já é `PRIMARY KEY`. Duas execuções tentando
criar o MESMO SKU colidem na própria chave primária. Quem perde a corrida
verifica se o produto passou a existir e trata como recuperação — idêntico
em espírito ao `ajuste_qtd`, só que a chave de idempotência já existia,
não precisou ser criada. Prova em `src/reconciliacao-test.mjs`, cenário 25.

## Idempotência externa — `estoque_loja` e recuperação de PATCH

O PATCH da Nuvemshop é uma chamada HTTP — não entra num `db.batch()`, e
"a resposta se perdeu" ou "o Worker morreu logo depois do PATCH, antes de
gravar o status" são o mesmo problema visto de fora: **o efeito pode já
estar lá, e o banco não sabe.**

A resposta não é confiar em timing nem em heurística. `classificarDestinoEstoqueLoja`
(em `api/src/reconciliacao.js`) decide a partir de só quatro números —
`de`, `para`, `base_json` esperado e o estado atual (destino relido da loja
+ origem recalculada) — nunca de "quanto tempo faz" ou "quantas vezes já
tentei":

| Destino atual | Origem ainda bate com `base_json`? | Classificação | Ação |
|---|---|---|---|
| `de` | sim | `pendente` | Efeito não aconteceu — aplica de verdade (PATCH) |
| `de` | não | `obsoleto` | Origem mudou — não aplica |
| `para` | sim | `recuperado` | O efeito já está lá — confirma `aplicado`, **sem reenviar PATCH** |
| `para` | não | `obsoleto` | Destino bate por coincidência, não por causa deste Apply — não confirma sozinho |
| nem `de` nem `para` | — | `obsoleto` | Algo mais mudou lá fora |

A linha que mais importa é a quarta: destino já é `para`, mas a origem
mudou. Não vira `aplicado` automaticamente só porque o número bateu — seria
exatamente o erro que a Precondition B existe para evitar (§ As duas
preconditions). Vira `obsoleto`, e uma sessão nova decide de novo com dado
fresco.

Prova automatizada em `src/reconciliacao-test.mjs`: cenário 4b (destino já
é `para`, origem válida → recupera sem PATCH novo), 4c (destino já é
`para`, origem mudou → obsoleto, não confirma sozinho), 3 (destino é outra
coisa qualquer → obsoleto) e 1 (fluxo normal, destino ainda é `de` →
aplica de verdade).

Sob concorrência real (duas chamadas processando o mesmo item ao mesmo
tempo), o PATCH em si não tem trava de banco — mas por ser uma escrita de
valor ABSOLUTO, mandar o mesmo PATCH duas vezes dá o mesmo resultado. O
cenário 6 do teste prova isso: sob duas chamadas simultâneas pode sair mais
de um PATCH (não há CAS pré-escrita para `estoque_loja`, de propósito —
ver "Sessão aplicando" abaixo), mas todos concordam no mesmo valor final, e
o item termina num estado só, nunca ambíguo.

## Sessão `aplicando` — retomada depois de um crash

Se o Worker morre no meio de um Apply, a sessão fica presa em `aplicando`
— não existe (e esta tarefa não criou) um processo separado que a destrave
sozinha. Em vez disso, a MESMA rota `POST /api/reconciliacao/:id/aplicar`
aceita reentrar numa sessão que já está `aplicando`:

```
sessão.status == 'revisao'    → tenta o CAS de entrada (revisao→aplicando)
sessão.status == 'aplicando'  → segue direto (retomada — nossa ou de uma
                                 chamada anterior que não terminou)
qualquer outro status         → 409, sempre. Nunca reabre sessão terminada
                                 (aplicada, aplicada_parcial, cancelada,
                                 superada, erro)
```

A retomada consulta os itens `aprovado` que sobraram (ignora
`pendente`/`rejeitado`/`aplicado`/`obsoleto`/`erro` — cada um já está onde
deveria) e processa só esses, com as mesmas duas preconditions de sempre.
A finalização também é idempotente: sempre recontada a partir do estado
REAL da sessão inteira no banco (quantos itens terminaram `aplicado` /
`obsoleto` / `erro`), nunca só do que UMA chamada processou — assim, se
duas chamadas terminam de processar itens diferentes quase ao mesmo tempo,
as duas calculam o MESMO resultado final e a última a escrever não
contradiz a anterior.

Por que não um lock de sessão mais forte (uma segunda trava impedindo
QUALQUER retomada concorrente): a proteção por item (CAS + índice único)
já é suficiente, e tentar impedir concorrência a mais uma vez, num lugar
que já está protegido, só adicionaria complexidade sem fechar buraco
nenhum — na linha do que a decisão de "Sessões concorrentes" já escolheu
para a entrada da sessão.

Prova automatizada: `src/reconciliacao-test.mjs`, cenário 16 (sessão
inserida direto no D1 já em `aplicando`, com um item já `aplicado` de uma
"execução anterior" e outro ainda `aprovado` — a retomada ignora o
primeiro, processa o segundo, e a sessão fecha certa).

## O que fica de fora de propósito

`movimentos.origem` continua sendo o campo texto livre de sempre
(`'importacao'`, `'venda'`, `'variacao'`, …) para descrever DE ONDE veio um
movimento — um movimento de reconciliação usa `origem = 'reconciliacao'` e
`obs` carrega sessão e item em texto, o mesmo padrão que
`sync.js › puxarPedidos` já usa. `reconciliacao_item_id` é uma coisa
diferente: não descreve origem, é a CHAVE DE IDEMPOTÊNCIA — o que o índice
único protege. As duas colunas convivem porque respondem perguntas
diferentes ("de onde veio" × "este item específico já gerou efeito
alguma vez").

## Backup — pré-condição de produção

O backup de `backups/d1/2026-08-18_06-22/` foi validado e reconferido nesta
mesma fase (carregado num banco limpo: 16 tabelas, razão em 0 divergências).
Isso prova que o MECANISMO de backup funciona — não substitui um backup
tirado na hora.

**Antes de aplicar `api/migracao-reconciliacao.sql`,
`api/migracao-idempotencia-reconciliacao.sql` ou `api/migracao-sync-seco.sql`
em produção: gerar um backup novo, imediatamente antes da operação.** A
loja escreve o dia inteiro; um backup de horas atrás não cobre o que
aconteceu depois. Ver
[BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).

## Estado real desta fase

| | |
|---|---|
| Schema | Fechado — duas tabelas, cinco índices, dois `CHECK`. Origem agora é `nuvemshop` \| `planilha_estoque_total` \| `planilha_produtos_novos` |
| Idempotência de `movimentos` | Fechada — `reconciliacao_item_id` + índice único (`api/migracao-idempotencia-reconciliacao.sql`) |
| Migration aplicada em produção | **Não** — nenhuma das duas (`migracao-reconciliacao.sql`, `migracao-idempotencia-reconciliacao.sql`) |
| Migration aplicada em dev local | Só dentro dos testes (`--persist-to` descartável, ou o estado de dev do Worker durante `node src/reconciliacao-test.mjs`) |
| Rotas de API | `POST /api/reconciliacao` (nuvemshop), `.../planilha/estoque-total/analisar`, `.../planilha/produtos-novos/analisar`, `GET /api/reconciliacao/:id`, `.../itens/:id/aprovar`, `.../rejeitar`, `.../cancelar`, `.../aplicar` (com retomada) |
| Backend do Apply | Existe — `api/src/reconciliacao.js`. Executa `estoque_loja` (nuvemshop), `ajuste_qtd` (planilha_estoque_total) e `produto_novo` (só planilha_produtos_novos), resistente a crash/retry/concorrência; `campo` vira `erro` explícito (sem gerador nem execução ainda) |
| Tela de aprovação real | Não existe (a tela atual é só leitura da rodada seca) — próxima fase |
| Testes de schema | `src/reconciliacao-schema-test.mjs` — 65 asserções, banco local descartável |
| Testes do Apply | `src/reconciliacao-test.mjs` — 143 asserções, contra o Worker + loja falsa (as três origens, recuperação de PATCH, concorrência real, retomada de sessão, consignação, produtos novos nunca sobrescrevendo existente) |
| Testes da correção do TECH_DEBT 12 | `src/saude-sync-test.mjs` — 25 asserções |

Ver [ROADMAP_RECONCILIATION.md](ROADMAP_RECONCILIATION.md) para o que vem
depois.
