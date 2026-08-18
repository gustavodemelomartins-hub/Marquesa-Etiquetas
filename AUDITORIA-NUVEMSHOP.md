# Auditoria técnica — Marquesa Etiquetas × Nuvemshop

> Documento de diagnóstico, sem nenhuma alteração de código, banco ou UI.
> Escrito para dar a outro agente de IA (ou a qualquer pessoa) contexto suficiente
> para discutir a redefinição da arquitetura de sincronização, tratamento de
> conflitos e UX do painel — sem precisar ler o repositório inteiro primeiro.
>
> Não há acesso ao banco D1 de produção a partir deste ambiente (é remoto, na
> Cloudflare, sem credenciais aqui). Os "exemplos reais" da seção F vêm de
> números já documentados no próprio repositório (`api/REGRAS.md`, resultado de
> uma auditoria anterior sobre os dados reais) e de cenários da suíte de testes
> automatizados — sempre identificados como tal.

---

## A. Resumo executivo

O sistema é uma ferramenta de controle de estoque para a Marquesa Semijoias:
um Cloudflare Worker + banco SQLite (D1) que registra cada peça por um
**código (SKU)**, todo movimento de estoque como um **lançamento contábil**
(nunca como edição direta de um número), e o ciclo de consignação com
revendedoras (peça sai numa "maleta", volta ou vira venda no acerto). Por cima
disso foi construída a integração com a Nuvemshop, com dois movimentos
automáticos por rodada: **puxar pedidos** (toda venda no site vira uma venda
aqui, com baixa de estoque) e **empurrar estoque** (o que sobra "em casa" —
total menos o que está com revendedoras — é mandado para a loja).

As divergências que aparecem no painel **não são, na maioria dos casos,
bugs**: são o sistema recusando adivinhar. Ele foi construído
deliberadamente para nunca sobrescrever um saldo sem uma razão registrada e
nunca dividir estoque entre variações "no chute". Quando os dois lados
(interno × Nuvemshop) não batem de um jeito que o código não sabe resolver
com segurança, ele **para e avisa** em vez de decidir sozinho. O problema
real não é técnico — é que hoje **todos esses avisos, de natureza muito
diferente entre si (informativo, crítico, cadastro incompleto, ambiguidade),
aparecem juntos, no mesmo formato visual**, sem hierarquia clara do que
exige ação agora.

Vale registrar um ponto positivo raro para uma auditoria: o código já é
extraordinariamente bem documentado — comentários explicam o *porquê*, não o
*o quê*, e `api/REGRAS.md` documenta decisões conscientes com números reais
de auditoria de dados. Isso ajuda muito a confiar na reconstrução da
arquitetura feita abaixo.

---

## B. Arquitetura atual

**Frontend** — um único arquivo (`src/dashboard.tpl.html`, ~3800 linhas) com
HTML+CSS+JS vanilla, sem framework. É compilado para `dashboard.html` na
raiz via `src/build.py`. É uma PWA instalável (manifest, service worker,
leitor de código de barras via câmera com `vendor/zxing.min.js`). O estado é
um objeto JS global (`state`), buscado inteiro em `GET /api/state` e
re-renderizado por completo a cada mutação.

**Backend** — Cloudflare Worker (`api/src/index.js`), um único
`fetch(request)` com roteamento manual via regex sobre `path`/`method` — sem
framework HTTP. Um handler `scheduled()` separado roda o cron.

**Banco** — Cloudflare D1 (SQLite gerenciado). Schema declarado em
`api/schema.sql`; evolução via arquivos `migracao-*.sql` aplicados
manualmente (sem ORM, sem ferramenta de migração automatizada).

**Autenticação** — uma única `API_KEY` estática como Bearer token
(`api/src/auth.js`) — não é multiusuário nem por papel; é uma ferramenta de
uma pessoa só, como o próprio comentário do código assume.

**Integração Nuvemshop** — `api/src/nuvemshop.js` é o cliente HTTP
(paginação, respeito ao rate limit, tradução de erros para frases
acionáveis). `api/src/nuvemshop-oauth.js` resolve o fluxo de app de
parceiro (OAuth) para lojas sem acesso a "Aplicativo sob medida" — devolve o
token numa página HTML para colar manualmente nos Secrets do Worker; **não
há gravação automática do token**.

**Fluxo de dados** — o Worker lê/escreve o D1 diretamente dentro das rotas;
não há camada de serviço/repositório separada. A lógica de sincronização
(`api/src/sync.js`) chama a API da Nuvemshop e o D1 diretamente, na mesma
função.

---

## C. Modelo de dados

Tabelas principais (`api/schema.sql`):

- **`produtos`** — PK é o próprio `sku` (TEXT). `qtd` é o saldo **total**
  materializado (inclui o que está consignado com revendedoras). `preco` é
  `REAL` *nullable* (`NULL` = "sem preço", nunca 0 por omissão). Campos
  espelhados da loja: `url_loja`, `estoque_loja`, `visivel`, `nome_loja`.
- **`movimentos`** — o razão contábil de verdade. Todo evento de estoque
  (entrada, venda, ajuste, consignação, devolução, perda...) é uma linha
  aqui, com efeito assinado (`qtd`). Invariante do sistema:
  `produtos.qtd == SUM(movimentos.qtd)` por SKU, provável a qualquer momento
  via `GET /api/estoque/conferir`. Tem uma coluna opcional `variacao` — é
  aqui que mora o saldo por variante (tamanho/aro/cor), não numa tabela
  paralela.
- **`produto_variacoes`** — catálogo das variantes que a Nuvemshop declara
  para um SKU (nome, atributo, `variante_id`, `produto_id`,
  `estoque_loja`). É **reescrita do zero a cada sincronização** (DELETE +
  INSERT) — não existe histórico de variante, só o retrato atual.
- **`kit_componentes`** — um SKU "kit" nunca tem saldo próprio (`qtd` fica
  sempre 0); seu disponível é calculado na hora como o mínimo entre
  `floor(disponível do componente / qtd necessária)` de cada componente.
- **`maletas` / `maleta_itens`** — consignação com revendedoras; reduz o
  "disponível para vender" mas não o total.
- **`vendas` / `venda_itens`** — vendas de balcão, de acerto de maleta e do
  site (`origem = 'site'`), todas na mesma tabela. `vendas.externo_id`
  (`"nuvemshop:<id do pedido>"`) tem índice único — é a trava de
  idempotência contra reprocessar o mesmo pedido.
- **`loja_snapshot`** — uma única linha com o retrato agregado da última
  leitura da loja (contadores, não itens).
- **`inventarios` / `inventario_itens`** — contagem física, com `esperado`
  congelado no fechamento.
- **`config`** — chave/valor genérico: guarda tanto preferências editáveis
  (limites do freio de segurança) quanto estado interno da sincronização
  (data do último pedido lido, lista de variações não empurradas).

**Relações-chave**: `produto 1—N movimentos`; `produto 0..N
produto_variacoes` (só existe linha aqui quando a Nuvemshop declarou mais de
uma variante para aquele SKU); `produto` pode ser um kit (`kit_sku` em
`kit_componentes`, apontando para outros `produtos.sku`); `produto N—N
maletas` via `maleta_itens`; `produto N—N vendas` via `venda_itens`. **O SKU
(string) é a única chave de junção entre tudo isso e a Nuvemshop** — não
existe ID interno numérico de produto, nem mapeamento persistente e estável
de `produto_id`/`variante_id` da Nuvemshop além do que é regravado a cada
rodada.

---

## D. Fluxo de sincronização atual

Função `sincronizar()` em `api/src/sync.js`. A ordem é a decisão
arquitetural mais importante do arquivo, e o próprio código explica por quê
(inverter desfaria vendas do site).

1. **Verifica conexão** (token/loja configurados) e cria uma linha em
   `sync_execucoes` (`status='rodando'`).
2. **Lê a loja inteira**: `loja.produtos()` — todas as páginas, todos os
   produtos e variantes.
3. **`mapearSkus()`** constrói um `Map<SKU, {...}>` agrupando por SKU de
   variante (maiúsculo, sem espaços nas pontas). Aqui já se separam dois
   fenômenos que antes eram confundidos: **duplicado** (mesmo SKU em
   `produto_id` diferentes — cadastro duplicado de verdade) vs. **múltiplas
   variantes** (mesmo SKU, mesmo produto, várias linhas de variante —
   tamanho/cor, normal).
4. **`puxarPedidos()`** — busca pedidos criados desde o último watermark
   (`config.syncUltimoPedido`), com 6h de folga para trás. Para cada pedido
   não cancelado e ainda não registrado (`externo_id`): casa cada item pelo
   **SKU exato** contra `produtos`; item sem casamento vai para
   `itensIgnorados` e é descartado da venda; se pelo menos uma linha casou,
   cria `vendas` + `venda_itens` + `movimentar('venda')` por linha.
   Atualiza o watermark para a data do pedido mais novo lido.
5. **`semearVariacoes()`** — reparte automaticamente o saldo total em
   saldo-por-variação, **só** para SKUs "virgens" (nenhum movimento com
   `variacao` não-nula ainda) **e só** quando a soma das variantes na loja
   bate exatamente com o total interno. Se não bate, não reparte nada e
   registra em `naoSemeados`.
6. **`empurrarEstoque()`** — calcula `casa = qtd − consignado` para cada
   produto ativo não-kit, mais o disponível calculado dos kits. Para SKU
   com múltiplas variantes: só empurra se não há impedimento (`duplicado` >
   `maleta` > `sem_reparticao`, nessa ordem de prioridade); senão empurra
   por variante endereçada (`variante_id`). Para SKU simples: compara
   `casa` com o número da loja. Junta tudo em `mudancas[]`.
   **Freio de segurança**: se `mudancas.length > syncLimiteMudancas`
   (padrão 40) ou zeragens > `syncLimiteZerar` (padrão 15), e não foi
   passado `forcar:true`, a rodada **para sem escrever nada** e fica
   marcada `pausado`. Passado o freio (ou com `forcar`), escreve via `PATCH
   /products/stock-price` em lotes de 25.
7. **`gravarRetratoDaLoja()`** — só depois de empurrar, para o retrato já
   nascer com os números novos: apaga e reescreve
   `url_loja/estoque_loja/visivel/nome_loja` de todos os produtos e a
   tabela `produto_variacoes` inteira, grava `loja_snapshot` e a lista de
   "não empurrados" em `config`.

**Onde a escrita de verdade acontece**: só dentro de `empurrarEstoque()`, no
`PATCH` para a Nuvemshop — e só se o freio não tiver parado a rodada e o
modo `seco` (dry-run) não estiver ativo. Tudo o mais (banco interno,
`loja_snapshot`) é sempre escrito, mesmo em `seco`, porque ler a loja e
registrar o que foi lido não é considerado "aplicar mudança".

---

## E. Tabela de conflitos

| conflito (rótulo no painel) | condição que gera | origem A (interno) | origem B (Nuvemshop) | risco | comportamento atual |
|---|---|---|---|---|---|
| **Produtos na loja** | Contador puro, não é conflito | `loja_snapshot.produtos_casados` / `.so_na_loja` | `produtosLoja.length` da leitura | nenhum | Só exibe; nenhuma ação de escrita associada |
| **Estoque errado no site** | `estoqueLoja !== casa` para SKU sem múltiplas variantes (`panoramaLoja().desatualizados`) | `produtos.qtd − consignado` (calculado) | `produto.estoque_loja` (espelho da última leitura) | **Baixo enquanto não sincroniza** — a régua é sempre o interno; risco só existe se a próxima sync empurrar um número errado | Se `sync` automática está ligada: autocorrige na próxima rodada (mostrado como aviso "info", não crítico). Se está desligada: pede export manual de CSV |
| **Falta subir** | `!urlLoja && casa > 0` | Produto existe em `produtos`, `qtd − consignado > 0` | Nenhuma linha em `mapa` para esse SKU | nenhum (não escreve nada) | Sistema **nunca cria produto** na Nuvemshop — fica na lista até alguém cadastrar manualmente |
| **Parado por falta de cadastro** | Mesma condição de "Falta subir", só que expresso em R$ (`certo(p) * preco`) | idem | idem | nenhum | Só é a versão financeira do card acima — informação redundante |
| **Produtos mudaram depois da última sincronização** | Mesma condição de "Estoque errado", reclassificada como benigna quando `sync.conectada === true` | idem | idem | **Nenhum na prática** — é o efeito esperado de uma venda de balcão/maleta ocorrida depois da última rodada | Vira mensagem "info" em vez de "warn"; oferece só "Sincronizar agora" |
| **Códigos têm mais de uma variação no site** | `naLoja.variantes.length > 1` e `naLoja.produtos.size === 1` (não duplicado) | `produtos.qtd` (um número só) | Soma de `variant.stock`/`inventory_levels` por variante | **Zero enquanto não semeado** — é o próprio freio de `semearVariacoes` que impede a divisão às cegas | Fica listado à parte, fora de "estoque errado"; se a soma da loja bate com o total interno, é semeado sozinho na próxima rodada; se não bate, fica represado em `naoSemeados` até correção manual (`POST /produtos/:sku/repartir`) |
| **Códigos com peça em casa não existem na loja** | Mesma condição de "Falta subir" (é o mesmo grupo, nome mais explícito) | idem | idem | nenhum | idem |
| **(implícito) Cadastro duplicado** | `naLoja.produtos.size > 1` (mesmo SKU em 2 `product_id` diferentes) | 1 SKU no catálogo interno | 2+ anúncios na Nuvemshop com o mesmo SKU | **Alto se ignorado**: estoque real fica dividido entre dois anúncios, nenhum dos dois nunca fecha | Excluído da lista de "estoque errado" e do empurrão (`impedimento: 'duplicado'`); só é possível corrigir dentro do painel da Nuvemshop, fora do sistema |
| **(implícito) Repartição incompleta (`sem_reparticao`)** | SKU com variantes onde `atribuido !== qtd` (sobra "sem variação") | Total interno tem parte não atribuída a nenhuma variante | Loja tem caixinhas por variante que somam menos que o total | **Zero por desenho** — nada é empurrado enquanto não fechar 100% | Fica em `semEmpurrar`; peça "sem variação" nunca é anunciada em variante nenhuma até alguém repartir manualmente |
| **Item de pedido sem SKU correspondente** | `puxarPedidos`: `sku` do item do pedido não bate com nenhum `produtos.sku` | — | Pedido da Nuvemshop com SKU desconhecido | **Real** — a linha (e, se for a única do pedido, o pedido inteiro) é descartada da contabilidade de vendas e de baixa de estoque | Vai para `relato.itensIgnorados`, aparece só no relatório técnico da rodada, não em card dedicado no painel |

---

## F. Exemplos reais

Como não há acesso ao banco de produção deste ambiente, os exemplos abaixo
vêm de duas fontes: (1) números já apurados sobre os dados reais e
documentados em `api/REGRAS.md`; (2) cenários da suíte de testes
automatizados (`src/variacoes-test.mjs`), que reproduzem — com dados
sintéticos, claramente marcados — exatamente os mesmos casos que o painel
classifica.

### F.1 — Real (de `api/REGRAS.md`): SKU com sufixo

> "dos 14 códigos com sufixo na planilha de estoque, **nenhum** tem
> descrição diferente da sua base; **10 deles** têm o código-base ausente
> da planilha mas presente na loja."

Exemplo com código real citado no documento: `486476` / `486476-2`.

- **Sistema interno**: o sufixo `-2` normalmente representa a mesma peça
  comprada numa compra posterior — é consolidado no código-base **na
  importação**, com aviso quando as descrições divergem (nunca em
  silêncio).
- **Nuvemshop**: o SKU pode aparecer com o sufixo intacto, como uma
  variante de estoque própria (`mapearSkus` **não** remove o sufixo).
- **Resultado atual**: se a consolidação de sufixo não tiver acontecido
  igual nos dois lados, o sistema pode enxergar dois "códigos" onde a loja
  só declarou um, ou vice-versa — risco documentado como "estoque negativo
  fantasma" caso a regra do documento original (`486476` ≠ `486476-2`)
  fosse seguida à risca. **Motivo**: divergência de convenção de
  nomenclatura entre a planilha original e a operação real, não erro de
  sincronização.

### F.2 — Real (de `api/REGRAS.md`): confusão "variação × duplicata" (bug já corrigido)

> "`mapearSkus` tratava os dois como duplicata e a tela acusava 56 numa loja
> que tem 2 [...] a versão anterior fazia `continue` e descartava a
> variação. Sobrava só a primeira — e era nela que a sincronização escrevia
> o estoque inteiro do código."

- **Sistema interno**: nenhum SKU específico, é um padrão — 56 códigos da
  loja têm múltiplas variantes (tamanho, aro, cor).
- **Nuvemshop**: 2 desses 56 eram, de fato, cadastro duplicado (mesmo SKU
  em dois anúncios); os outros 54 eram variação legítima de um produto só.
- **Resultado atual (já corrigido)**: hoje os 54 aparecem em "Códigos com
  mais de uma variação" (não é erro), e só os 2 verdadeiros aparecem em
  "cadastrado em dois produtos diferentes". Antes da correção, os 56
  apareciam juntos como "duplicata" e o bug ainda escrevia o estoque
  inteiro numa única variante, zerando as outras.

### F.3 — Real (de `api/REGRAS.md`): freio pegando o bug herdado

> "Não foi hipótese: o freio da rodada barrou o cenário real, com **16
> produtos** que seriam zerados."

- **Sistema interno**: total correto por código (ex.: 6 unidades).
- **Nuvemshop**: herança de um bug anterior — a primeira variante mostrava
  o total inteiro do código (6), as demais mostravam o resto da conta
  antiga; a soma das variantes **não batia** com o total interno.
- **Resultado atual**: `semearVariacoes` recusa dividir (soma ≠ total);
  os 16 produtos ficam em `naoSemeados`, sem nenhuma variante zerada.

### F.4 — Sintético (do teste `variacoes-test.mjs`), ilustrando o caso "código com variação"

Reproduz fielmente a lógica de repartição — números fictícios, mesmo
mecanismo do sistema real:

```
Código: ANEL
Sistema interno:
  quantidade total: 6
  descrição: "Anel Solitário"
  variações: nenhuma ainda (código "virgem")

Nuvemshop:
  produto_id: 80
  atributo declarado: "Aro"
  variantes: Aro 16 → estoque 2 | Aro 18 → estoque 3 | Aro 20 → estoque 1
  soma das variantes: 6

Resultado atual:
  conflito detectado: nenhum — soma da loja (6) bate com o total interno (6)
  ação do sistema: semeia sozinho, sem confirmação:
    Aro 16 = 2, Aro 18 = 3, Aro 20 = 1 (movimentos tipo "ajuste", origem "variacao")
  depois de uma venda de 1 unidade do Aro 18 pelo balcão:
    total interno cai para 5, Aro 18 cai para 2
    a loja recebe de volta: Aro 16=2, Aro 18=2, Aro 20=1 (nunca o total inteiro numa caixinha só)
```

Mesmo teste, cenário de conflito real (herança do bug, replicando F.3 com
dados fictícios):

```
Código: HERANCA
Sistema interno: quantidade total = 6

Nuvemshop:
  Aro 16 → estoque 6 (herança do bug: total inteiro numa variante só)
  Aro 18 → estoque 2
  Aro 20 → estoque 1
  soma das variantes: 9

Resultado atual:
  conflito detectado: soma da loja (9) ≠ total interno (6)
  motivo: ambiguidade — o sistema não sabe se o total interno está desatualizado
          ou se a loja tem estoque "fantasma" herdado de um bug anterior
  ação do sistema: NÃO reparte nada; SKU inteiro fica fora do empurrão
          (motivo "sem_reparticao"); nenhuma variante é zerada
```

---

## G. Regras de matching

- **Chave de correspondência única**: o **SKU como string**, normalizado
  apenas por `trim()` + maiúsculas — sem normalização de zeros à esquerda,
  sem remoção de sufixo neste ponto, sem correspondência por nome/EAN.
- **Onde a normalização de sufixo acontece**: só na **importação de
  planilha interna** (`base_sku` no script de seed / regra de consolidação
  citada em `REGRAS.md`), nunca dentro de `mapearSkus`. Ou seja, o SKU que
  chega da Nuvemshop é comparado **literalmente** contra `produtos.sku`.
- **Identidade de variante dentro de um SKU**: não é o `variante_id` da
  Nuvemshop que persiste como identidade ao longo do tempo — é o **nome**
  da variante (`values` concatenado, ex. `"16"`, `"Dourado"`), porque
  `produto_variacoes` é **inteiramente reescrita a cada sincronização**
  (`DELETE FROM produto_variacoes` seguido de novo `INSERT`). O
  `variante_id` só é usado dentro da mesma rodada, para endereçar o
  `PATCH` de volta à caixinha certa.
- **O que acontece quando existem várias variantes**: o sistema já sabe
  separar "várias variantes do mesmo produto" (normal) de "mesmo SKU em
  produtos diferentes" (cadastro duplicado real). Para o primeiro caso, o
  saldo por variante só é dividido **automaticamente** quando (a) nenhuma
  peça daquele SKU já foi atribuída a variante nenhuma, e (b) a soma das
  variantes na loja bate exatamente com o total interno.
- **Por que diz "não consegue distribuir estoque"**: porque a única fonte
  de "quanto tem de cada tamanho/cor" é a própria Nuvemshop (o sistema
  interno só tem um número por código até a primeira repartição
  acontecer). Se essa soma não bate com o total interno, não há como saber
  **qual dos dois números está errado nem em qual variante está o erro** —
  dividir arbitrariamente arriscaria "vender" uma peça que não existe ou
  tirar do ar uma que existe.
- **O que falta para resolver com segurança**: um identificador estável de
  variante que sobreviva entre rodadas (hoje é recriado do zero a cada
  sync) e, principalmente, uma fonte independente de "quantas peças de
  cada variante existem fisicamente" — hoje essa contagem só existe depois
  que a primeira repartição acontece; antes disso, o sistema literalmente
  não tem o dado, só o total agregado.

---

## H. Source of truth atual (campo por campo)

Nenhuma dessas regras está escrita como uma "política" explícita em um só
lugar — são inferidas da direção em que os dados fluem dentro de
`sync.js`/`nuvemshop.js`. Isso é dito onde relevante abaixo.

| campo | fonte da verdade hoje | evidência |
|---|---|---|
| **código/SKU** | Nem um nem outro — é a **chave de junção**; precisa bater literalmente nos dois lados | `mapearSkus`, `puxarPedidos` (comparação exata) |
| **nome do produto** | **Interno** (`produtos.desc`) nunca é sobrescrito pela sincronização | `sync.js` só grava `nome_loja` (campo espelho separado), nunca escreve em `desc` |
| **quantidade (total)** | **Interno** é a fonte; a Nuvemshop é sempre destino da escrita | `empurrarEstoque` só lê a loja para comparar, nunca grava `produtos.qtd` a partir dela |
| **quantidade (por variação)** | **Híbrido, e não documentado como regra explícita**: a Nuvemshop é fonte só na primeira repartição (uma vez), e o interno vira fonte definitiva a partir daí | `semearVariacoes` (semente única) vs. `movimentos.variacao` (razão contábil dali em diante) |
| **preço** | **Nenhum dos dois é sincronizado com o outro** — não há leitura nem escrita de preço entre os sistemas | Ausência de qualquer campo de preço em `nuvemshop.js`/`sync.js`; `produtos.preco` só é editado manualmente ou por importação de planilha |
| **cadastro do produto (existir ou não na loja)** | **Nuvemshop** — o sistema nunca cria produto lá | Comentário explícito em `REGRAS.md`: "ela não cria produto na Nuvemshop" |
| **cadastro de variante (quais existem, atributo, nome)** | **Nuvemshop** — reescrito do zero a cada rodada | `DELETE FROM produto_variacoes` antes de reinserir |
| **vendas** | **Híbrido por origem**: Nuvemshop é fonte para vendas do site (`origem='site'`, puxadas); interno é fonte para balcão/acerto | `puxarPedidos` só insere, nunca lê vendas de balcão de volta para a loja |
| **estoque físico** | **Interno**, por princípio de design (`movimentos` como razão) — mas isso pressupõe que todo evento físico (perda, quebra, consignação) seja de fato lançado lá; não há verificação cruzada com nenhuma fonte externa | `estoque.js`, `REGRAS.md` §19 |

---

## I. Processo de importação atual

Existem hoje **dois caminhos de escrita**, sem etapa formal de
"prévia → aprovação → aplicar" em nenhum dos dois:

### I.1 — Importação manual (planilha/CSV)

Fluxo no dashboard (`doImport()` em `dashboard.tpl.html`): o usuário sobe um
ou mais arquivos, o sistema tenta **detectar o tipo de cada um** pelo
cabeçalho (catálogo/estoque, export da Nuvemshop, maleta/Anexo I), o usuário
confirma qual arquivo é qual, e então:

1. `POST /api/produtos/importar` — grava **imediatamente**. Para SKU novo,
   cria produto + movimento de entrada. Para SKU existente, calcula o
   delta entre o número da planilha e o saldo atual e grava um `ajuste` —
   **sem limite de tamanho e sem confirmação linha a linha**; o retorno
   inclui uma lista de avisos (`avisos[]`), mas isso vem **depois** da
   escrita, não antes.
2. `POST /api/loja/importar` — grava **imediatamente**. Apaga
   `url_loja/estoque_loja/visivel` de **todos** os produtos e regrava
   com o que veio no arquivo.
3. Maletas, se houver planilha de Anexo I, também são aplicadas em
   sequência.

Ou seja: **a única "prévia" que existe é a detecção automática do tipo de
arquivo** — não há uma tela de diff mostrando "isto vai mudar de X para Y"
antes de gravar.

### I.2 — Sincronização automática (cron ou botão "Sincronizar agora")

Já descrita na seção D. O ponto relevante aqui: **o parâmetro `seco` (modo
seco/dry-run) já existe na API** (`POST /api/sync {"seco": true}`) e devolve
exatamente o mesmo relatório (`mudancas[]`, `semEmpurrar[]`,
`naoSemeados[]`, etc.) **sem gravar nada, nem no D1 nem na Nuvemshop**. Isso
já é, em essência, o mecanismo de "prévia" que falta — mas hoje não está
exposto como um passo de UX de primeira classe: o botão "Sincronizar agora"
do painel roda a sincronização de verdade direto, e o único "freio" visível
ao usuário é o limite automático de mudanças em massa (que pausa sozinho,
mas só acima de um certo volume).

### I.3 — Onde a escrita acontece, resumido

| ação | quando escreve | tem prévia hoje? |
|---|---|---|
| `POST /api/produtos/importar` | imediatamente, na mesma chamada | Não — só avisos pós-fato |
| `POST /api/loja/importar` | imediatamente, na mesma chamada | Não |
| `POST /api/sync` (padrão) | imediatamente, se abaixo do freio | Parcial — freio automático acima de N mudanças |
| `POST /api/sync {forcar:true}` | imediatamente, ignorando o freio | Não |
| `POST /api/sync {seco:true}` | **nunca escreve** | **Sim — já é o mecanismo de prévia, subutilizado na UI** |

### I.4 — O que mudaria arquiteturalmente para suportar `Importar → Ler → Comparar → Prévia → Classificar → Revisar → Confirmar → Aplicar → Resultado`

- Promover o modo `seco` de detalhe técnico interno a **primeiro passo
  obrigatório** de qualquer sincronização ou importação — gerar sempre o
  relatório de diff antes de perguntar se aplica.
  Para o repositório este documento é copiado a partir de um diagnóstico já
  levantado; **nenhuma implementação foi feita** — isso é matéria para a
  próxima etapa de design, mencionada no pedido original.
- Fazer `importarProdutos`/`importarLoja` devolverem um diff **antes** de
  gravar (uma rota "simular" separada da rota que aplica), assim como
  `sync` já faz com `seco`.
- Persistir esse diff computado (mesmo que temporariamente) para o passo de
  "usuário confirma" poder referenciar exatamente os mesmos itens
  revisados, em vez de recalcular na hora de aplicar (janela de corrida
  entre revisão e aplicação).
- Separar, na resposta de qualquer prévia, itens por **classificação de
  risco** (hoje tudo isso já existe como dado — `mudancas`, `zera`,
  `semEmpurrar`, `naoSemeados`, `itensIgnorados`, `duplicados` — só não é
  apresentado com essa hierarquia).

---

## J. Riscos atuais

1. **Importação de planilha aplica ajustes de estoque sem teto por item.**
   `importarProdutos` lança qualquer delta entre a planilha e o saldo atual
   como um movimento `ajuste`, sem confirmação linha a linha — uma
   planilha desatualizada ou com erro de unidade pode gerar ajustes grandes
   e silenciosos (só aparecem depois, agregados em `avisos`).
2. **`importarLoja` apaga e regrava campos de espelho de loja para TODOS os
   produtos a cada chamada.** Um arquivo incompleto zera temporariamente
   `url_loja`/`estoque_loja`/`visivel` de produtos que na verdade continuam
   publicados — o que pode disparar falsos "falta subir" até a próxima
   importação/sync correta. (Não afeta `qtd`, então o risco é de leitura
   errada, não de perda de estoque real.)
3. **Pedido do site com SKU não reconhecido pode ser perdido
   definitivamente.** Em `puxarPedidos`, se **nenhuma** linha de um pedido
   casar com um SKU interno, o pedido inteiro é descartado — nenhuma venda
   é criada, `externo_id` nunca é gravado. Como a janela de busca avança
   pelo watermark (`syncUltimoPedido`, com só 6h de folga), esse pedido
   pode sair da janela em rodadas futuras e nunca mais ser recuperado
   automaticamente — nem a venda financeira nem a baixa de estoque
   acontecem. Quando só *parte* das linhas casa, a receita registrada
   também fica subestimada (só as linhas casadas entram no total).
4. **`forcar:true` ignora o freio de segurança inteiro, de uma vez.** O
   freio (40 mudanças / 15 zeragens) é a principal proteção contra aplicar
   um lote de dado interno quebrado — mas o botão "Aplicar mesmo assim" o
   desliga por completo, sem revisão item a item, mesmo que a causa real da
   massa de mudanças seja um erro de importação anterior.
5. **Cadastro duplicado (mesmo SKU em 2 anúncios) nunca se autocorrige.**
   Enquanto persistir, aquele SKU fica permanentemente fora do empurrão de
   estoque — os dois anúncios podem divergir do real por tempo
   indeterminado, e nada no painel força a correção manual na Nuvemshop.
6. **Repartição automática de variação, uma vez feita, só pode ser desfeita
   em bloco se ninguém tocou manualmente naquele SKU.** É uma escolha
   deliberada (nunca desfazer trabalho humano), mas tem um efeito colateral
   digno de nota: um SKU parcialmente corrigido à mão perde a opção de
   "desfazer automática" para o resto que ainda era da semeadura — só resta
   correção manual completa.
7. **Não há diff-antes-de-aplicar como fluxo padrão.** O modo `seco` existe
   na API mas o botão principal do painel ("Sincronizar agora") já executa
   de verdade. Sem essa etapa exposta, o operador só vê o que mudou
   **depois** que já mudou (exceto quando o freio intervém).

---

## K. Problemas de UX atuais (sem redesenhar)

Análise de `renderLoja()` e funções relacionadas em `dashboard.tpl.html`:

- **Empilhamento de blocos de alerta com o mesmo componente visual**
  (`class="warn"` / `class="warn info"`) para naturezas muito diferentes:
  banner de conexão (`painelSync`, aparece só se desconectado/pausado/erro)
  → 4 cards de KPI → até 4 caixas de aviso empilhadas (estoque errado,
  duplicados, variações, falta subir) → painel com tabela filtrável. Num
  dia ruim, isso é 5 idiomas visuais de alerta antes de chegar à tabela de
  produtos.
- **A mesma classificação vira "info" ou "warn" dependendo de contexto**
  (`ligada` = sync automática conectada), mas o número exibido é
  idêntico — o usuário não tem como saber, olhando só o card, se aquele
  100 é grave ou vai se resolver sozinho às 6h.
- **Redundância de informação**: a contagem de "estoque errado" aparece no
  card KPI, na caixa de aviso, na aba/pill de filtro **e** de novo como
  selo (`badge`) por linha na tabela — o mesmo fato, quatro lugares.
- **"Duplicados" é mostrado como alerta acionável, mas não há ação alguma
  no app** — a correção só existe dentro do painel da Nuvemshop. É
  informação que hoje compete visualmente com alertas que *têm* botão.
- **Mistura de severidade real com severidade de dado incompleto**: "falta
  subir" (cadastro incompleto, sem risco de sobrescrita) tem o mesmo peso
  visual que "estoque errado desconectado" (que de fato exige ação para
  não vender errado).
- **Ações presentes e o que cada uma faz**:
  - `Sincronizar agora` → **escreve** (puxa pedidos + empurra estoque)
  - `Aplicar mesmo assim` → **escreve**, ignorando o freio de segurança
  - `Conferir de novo` → só relê (equivalente a dry-run manual)
  - `Gerar atualização de estoque` (CSV) → só download, fluxo manual legado
  - `Baixar lista para cadastrar` / `Baixar lista` (variações) → só download
  - `Ver quais são` → só filtro/navegação
  
  De ~7 controles visíveis na aba, **2 escrevem na loja de verdade**, e
  todos usam a mesma linguagem visual de botão (`btn-ghost`/`btn-gold`),
  então não há como diferenciar visualmente, num relance, "isto muda minha
  loja ao vivo" de "isto só baixa um arquivo".
- **Não existe uma etapa clara de reconciliação antes da alteração**: como
  já dito na seção I, o modo `seco` existe no backend mas não é o caminho
  padrão da UI.

---

## L. Arquivos importantes

| arquivo | função em uma frase |
|---|---|
| `api/src/index.js` | Roteador HTTP do Worker; todas as rotas REST, incl. `importarProdutos`, `importarLoja`, `repartirVariacoes`, `definirKit` |
| `api/src/sync.js` | O motor da sincronização com a Nuvemshop: puxar pedidos, semear variações, empurrar estoque, gravar retrato |
| `api/src/nuvemshop.js` | Cliente HTTP da API da Nuvemshop (rate limit, paginação, erros) + `mapearSkus` (monta o mapa SKU→produto/variantes) |
| `api/src/nuvemshop-oauth.js` | Fluxo OAuth do app de parceiro da Nuvemshop (troca `code` por token) |
| `api/src/estoque.js` | Regras de movimentação de estoque (razão contábil), saldos, kits |
| `api/src/inventario.js` | Conferência física: contagem, comparação, ajuste explícito |
| `api/src/state.js` | Monta o payload de `GET /api/state`, consumido inteiro pelo dashboard |
| `api/src/comissao.js` | Cálculo de comissão de revendedoras (faixas por banhadas, prata à parte) |
| `api/src/auth.js` | Autenticação por chave única + helpers de resposta JSON |
| `api/schema.sql` | Schema completo do banco D1 — fonte da verdade do modelo de dados |
| `api/migracao-*.sql` | Migrações incrementais aplicadas manualmente sobre o schema em produção |
| `api/REGRAS.md` | Documento vivo: cada regra de negócio ↔ onde vive no código, incl. divergências conscientes do documento original |
| `api/wrangler.toml` | Config do Worker: binding do D1, CORS, cron (6h/18h horário de Brasília) |
| `src/dashboard.tpl.html` | Todo o frontend num arquivo só, incl. `renderLoja`/`painelSync`/`panoramaLoja` e o assistente de importação |
| `src/build.py` | Gera `dashboard.html` final a partir do template |
| `src/sync-test.mjs`, `variacoes-test.mjs`, `kits-test.mjs`, `e2e.mjs`, `import-casa-test.mjs` | Suíte de testes de integração que sobem uma "loja falsa" e o Worker local para provar as regras acima |
| `src/loja-falsa.mjs` | Simulador da API da Nuvemshop usado nos testes |
| `api/gerar-seed.py` | Script usado para popular o banco a partir das planilhas reais originais, aplicando as mesmas regras da importação pela tela |

---

## M. Dúvidas que ainda precisam ser decididas pelo negócio

1. **Os cadastros duplicados de verdade na Nuvemshop** (mesmo SKU em dois
   anúncios) — quem unifica, e até quando eles ficam fora da sincronização
   automática de estoque?
2. **Regra de sufixo de SKU (`-2`, `-3`...)**: consolidar sempre no
   código-base é aceitável permanentemente, ou algum sufixo deveria um dia
   virar um código realmente distinto?
3. **Quando a soma das variantes da loja não bate com o total interno**
   (`naoSemeados`): hoje ninguém decide automaticamente qual número está
   certo — fica represado até correção manual. Qual deve ser o processo
   humano formal (quem revisa, em que prazo, o que acontece enquanto isso)?
4. **Os limites do freio de segurança** (40 mudanças / 15 zeragens por
   rodada) ainda fazem sentido para o tamanho atual do catálogo, ou devem
   mudar?
5. **Cadastro de produto novo na Nuvemshop continua manual para sempre**,
   ou o negócio quer que o sistema passe a criar produtos automaticamente
   (mudança de escopo grande — hoje o sistema nunca faz isso, por desenho)?
6. **Pedido do site com item cujo SKU não bate com nada interno**: hoje a
   venda daquele item (e possivelmente o pedido inteiro) é descartada
   silenciosamente da contabilidade. Qual deveria ser o comportamento
   correto — alertar, reter para revisão manual, bloquear a rodada?
7. **Preço**: hoje Nuvemshop e sistema interno são completamente
   independentes em preço (nenhuma sincronização em nenhuma direção). Isso
   é intencional (preço só é decidido na loja) ou deveria também
   sincronizar em algum sentido?
8. **Quais alertas realmente pedem ação humana "agora" vs. que são apenas
   informativos** — a distinção atual (`info` vs. `warn`) foi decidida no
   código, não formalmente pelo negócio; vale confirmar com o Gustavo/
   Marquesa quais categorias da seção E realmente merecem interromper o
   fluxo de trabalho.
