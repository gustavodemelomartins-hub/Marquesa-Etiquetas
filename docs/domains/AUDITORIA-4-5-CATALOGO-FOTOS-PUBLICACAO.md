# Auditoria da Fase 4.5 — Categorias, Fotos e Publicação

- **Data:** 2026-09-10
- **Branch auditada:** `claude/refactor-sistema-marquesa` (worktree `../Marquesa-Claude-Refactor`), HEAD `a7afa4b`
- **Natureza:** somente leitura. Nenhum código, migration ou deploy foi produzido.
- **PROD não foi consultada.** O que depende do dado real está na seção 12.

O mapa do projeto (PROJECT-MAP) **não existe nesta branch** — ele vive em
`codex/ui-system-marquesa` e, como registra a memória do projeto, ainda diz
"4.4 — próximo da fila", o que já não é verdade. Esta auditoria usa o Master
Plan (`docs/architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md` § 30),
`docs/domains/ESTOQUE-CATALOGO-BASELINE.md`, `api/REGRAS.md`, `api/schema.sql`
e o código real.

---

## 1. Como a Fase 4.5 funciona hoje

O Master Plan põe na Fase 4, item 5: "categorias, fotos, modelos de
personalização e publicação interna". As três já existem em produção como
código. A auditoria encontrou **um cadastro maduro, uma publicação que para
por desenho antes da loja, e uma camada de mídia que está estruturalmente
desligada em produção.**

### 1.1 Produtos

| Ato | Como acontece hoje | Onde |
|---|---|---|
| Criar | Não existe `POST /api/produtos`. Nascem por **três** caminhos: `POST /api/produtos/novos/cadastrar` (fluxo "peças novas"), `POST /api/produtos/importar` (planilha) e `POST /api/estoque-total/aplicar` (via fila de pendentes) | `catalogo.js › cadastrarNovos`, `catalogo-comandos.js › importarProdutos` |
| Editar | `PATCH /api/produtos/:sku` — só `desc`, `cat`, `preco`, `status`. Recusa `qtd` com 400 explícito (§19) | `catalogo-comandos.js › editarProduto` |
| Excluir | `DELETE /api/produtos/:sku` — recusa quem tem dependência, e a resposta oferece arquivar | `produtos.js › excluirProduto` |
| Arquivar | `POST /api/produtos/:sku/arquivar` / `desarquivar`, com motivo e data | `produtos.js` |
| SKU | Identidade. Normalização única (`sku.js › normSku`), unicidade garantida pelo índice de expressão `idx_produtos_sku_norm`. Gerador sorteia dentro de `100000–999999` com reserva em `sku_reservas` | `sku.js` |
| Descrição | `produtos.desc`. É a descrição da **etiqueta**, não a comercial — a comercial mora em `catalogo_publicacoes.descricao_site` | schema §38 |
| Preço | `produtos.preco REAL NULL`. §24: NULL é "sem preço", nunca 0 | schema |
| Quantidade | `produtos.qtd` materializado; verdade é `movimentos`. Nunca escrito direto | `estoque.js › movimentar` |
| **Custo** | **Não existe.** Não há coluna de custo em `produtos`. O Master Plan § 31 (Fase 5) prevê "custo histórico corrigível por evento auditável" — é Fase 5, não 4.5 | — |
| Categoria | `produtos.cat TEXT NOT NULL REFERENCES categorias(nome)` | schema |
| Variações | `produto_variacoes`, chave `(sku, nome)`, casamento com a loja por `variante_id` (índice único). Coluna `origem` separa `'loja'` de `'local'` | `variantes.js`, `sync.js` |
| Status | `'ativo' \| 'inativo' \| 'arquivado'`, **sem CHECK no banco** | schema |
| Vínculo Nuvemshop | `produtos.url_loja`, `nome_loja`, `visivel`, `estoque_loja` — todos reescritos a cada rodada de sync. Não há coluna `produto_id` externo em `produtos` | `sync.js › gravarRetratoDaLoja` |

### 1.2 Categorias

- Armazenadas em `categorias (nome PK, ordem, cor)`, com **9 linhas semeadas
  pelo schema** (Colar, Brinco, Pulseira, Berloque, Anel, Argola, Pingente,
  Conjunto, Outros).
- **A chave primária é o próprio nome**, e `produtos.cat` é FK para ela. Isso
  é o fato mais consequente da auditoria de categorias: renomear uma
  categoria é impossível sem migration.
- **Rotas: só duas.** `GET /api/categorias` e `POST /api/categorias` (upsert
  de `ordem`/`cor`). **Não existe PATCH, não existe DELETE, não existe
  renomear.** Uma categoria criada errada é permanente pela API.
- Relação produto × categoria é **1:N** (um produto, uma categoria). Não há
  tabela de vínculo, não há hierarquia, não há tags.
- **Categorias locais × Nuvemshop: não há relação nenhuma.** A Nuvemshop tem
  seu próprio conceito de categoria e ele **nunca é lido nem escrito** por
  este sistema. `nuvemshop.js` não toca em `/categories`.
- Duplicidade: impedida pela PK para nome idêntico; **não impedida** para
  "Colar" vs "colar" vs "Colares" — a rota faz só `.trim()`.
- Órfãs: uma categoria sem produto nenhum não é detectada nem listada.
- Normalização de nome: **não existe** para categoria. (Existe para SKU e para
  nome de cliente, não para categoria.)
- Derivação por nome: `categoria-nome.js › categoriaPeloNome` classifica pela
  primeira palavra da descrição. É **palpite de importação e de relatório
  histórico**, nunca autoridade. A mesma tabela existe duplicada no painel
  legado (`CAT_MAP` em `src/dashboard.tpl.html`) — duplicação **declarada e
  testada** por `src/categoria-nome-test.mjs`.

### 1.3 Fotos e mídia

Existem **três camadas independentes** de foto, e elas respondem perguntas
diferentes. Confundi-las é o erro mais fácil de cometer aqui.

| Camada | Onde | Pergunta que responde | Fonte |
|---|---|---|---|
| Bytes nossos | R2, binding `FOTOS`, chave determinística `produtos/<sku>/original\|tratada`; referência em `produtos.foto_*_key/tipo/tam/status` | "temos a imagem?" | nós |
| Endereço anotado | `produtos.foto_url`, `foto_url_em`, `foto_origem` | "sabemos onde está a imagem da loja?" | Nuvemshop, copiado |
| Espelho da vitrine | `loja_fotos` (imagem_id PK, produto_id, url, posicao, principal, sku_norm, variante_id) | "o que a loja mostra hoje?" | Nuvemshop, reescrito por rodada |

Mais duas tabelas de apoio: `fotos_orfas` (imagem da loja cujo código não bate
com nenhum daqui, fila de decisão humana) e `produto_variacoes.imagem_url`
(imagem própria da variante, espelho).

- **Imagem principal:** `loja_fotos.principal` é gravado, não inferido —
  vem da menor `position` declarada pela loja.
- **Múltiplas imagens e ordem:** preservadas em `loja_fotos`. `GET
  /api/produtos/:sku/fotos` devolve a galeria ordenada. **Do lado nosso não
  há galeria**: `produtos` guarda exatamente duas imagens (original e
  tratada), uma de cada.
- **Upload:** `PUT /api/produtos/:sku/foto/:versao` (bytes crus).
  Trocar a original invalida a tratada, deliberadamente.
- **Exclusão:** `DELETE /api/produtos/:sku/foto` apaga as duas versões do R2 e
  limpa o D1.
- **Fundo branco:** `POST /api/produtos/:sku/foto/fundo-branco` manda os bytes
  em base64 para um serviço externo (`FOTO_FUNDO_URL`) e guarda o retorno.
- **Sincronização:** a rodada normal já ingere a galeria
  (`ingerirFotosDoCatalogo`); `POST /api/fotos/sincronizar` é contingência.
  `vincular-da-loja` grava só o endereço; `importar-da-loja` copia os bytes.
- **Produtos sem foto:** derivável de `foto_status` / ausência de chave.
- **Fotos órfãs:** `fotos_orfas`, com `UNIQUE(url)`. Adotáveis por
  `POST /api/fotos/orfas/adotar`.
- **Duplicatas:** a mesma URL nunca duplica em `fotos_orfas`; a mesma imagem
  em dois `imagem_id` diferentes na loja duplicaria em `loja_fotos` sem
  detecção.

**As tabelas estão vazias ou legadas?** Ver seção 7. A resposta curta:
`loja_fotos` e `fotos_orfas` são ativas e escritas pelo sync;
`produtos.foto_*_key` e todo o R2 estão **estruturalmente inativos em
produção** — ver 1.5.

### 1.4 Publicação

O que existe é uma **máquina de estados interna e uma aprovação registrada**.
Ela para, por desenho explícito (`CAT-06`, `api/REGRAS.md`), antes de escrever
na loja.

Estados declarados em `publicacao-catalogo.js › ESTADO_PUBLICACAO`:

| Estado | Como é decidido | Persistido? |
|---|---|---|
| `falta_informacao` | calculado por `faltasBasicas` | **não** — nem consta no CHECK da tabela |
| `em_preparacao_agente` | escrito por `preparar` | sim |
| `aguardando_aprovacao` | calculado (rascunho completo + foto tratada) | sim (por `reabrir`) |
| `aprovado_para_publicar` | escrito por `aprovar`, com assinatura dos dados | sim |
| `publicado` | **calculado a partir de `produtos.url_loja`** | linha nunca escrita |
| `falhou_ao_publicar` | lido, tratado por `repetir` | **nunca escrito por ninguém** |

Rotas: `preparar`, `previa`, `aprovar`, `reabrir`, `repetir` — todas devolvem
`escritaNaLoja: false`, e `aprovar` devolve o aviso "a publicação automática
continua desabilitada".

A **assinatura** (`dados_assinatura`) é o mecanismo mais bem desenhado deste
módulo: mudou nome, categoria, preço, quantidade em casa ou a foto tratada, a
aprovação anterior é automaticamente invalidada (`aprovacaoInvalidada`).

### 1.5 O fato que domina a Fase 4.5

**R2 não está habilitado na conta de produção.** `api/wrangler.toml` não
declara o binding `FOTOS` no ambiente raiz — só em `[env.staging]` — e o
comentário registra o porquê: erro 10042 da Cloudflare, bucket
`marquesa-fotos` nunca criado, e um `wrangler deploy` com o bloco falha antes
de publicar.

Consequências em cadeia, todas verificadas no código:

1. `salvarFoto` devolve recusa explícita sem `env.FOTOS`. Logo **upload,
   adoção de órfã, importação de bytes e fundo branco não funcionam em
   produção** — recusam com mensagem clara, o que é correto, mas recusam.
2. `foto_tratada_key` nunca fica preenchida em PROD.
3. `estadoDoItem` exige `foto_tratada_key` para sair de `em_preparacao_agente`.
   **Logo nenhum produto pode alcançar `aguardando_aprovacao` em produção.**
4. Logo `aprovar` é inalcançável, e a máquina de estados inteira fica presa em
   `falta_informacao` / `em_preparacao_agente`.

A publicação não está "esperando o executor externo". Ela está **bloqueada
dois passos antes dele**, por infraestrutura.

---

## 2. Fonte de verdade por campo

| Campo | Fonte de verdade hoje | Observação |
|---|---|---|
| SKU | **Local**, sem concorrente | `normSku` + `idx_produtos_sku_norm`. A loja carrega SKU na variante, mas ele é usado para *casar*, nunca para escrever |
| Nome (`desc`) | **Local** | `nome_loja` da Nuvemshop é espelho, lido e nunca aplicado |
| Nome comercial (site) | **Local**, em `catalogo_publicacoes.nome_site` | nunca sai daqui |
| Descrição (etiqueta) | **Local** (`produtos.desc`) | — |
| Descrição comercial | **Local** (`catalogo_publicacoes.descricao_site`) | preenchida por agente externo ou à mão; nunca publicada |
| Categoria | **Local**, sem concorrente | a Nuvemshop tem categorias e elas são simplesmente ignoradas |
| Preço | ⚠️ **DUAS FONTES CONCORRENTES** | `produtos.preco` é o preço de venda daqui; `loja_variantes.preco` e `produto_variacoes.preco` guardam o preço **da loja**. Ninguém compara, ninguém reconcilia, ninguém escreve. Podem divergir indefinidamente sem alarme |
| Estoque (total) | **Local**, `movimentos` → `produtos.qtd` | a loja é destino |
| Estoque (por variação) | **Local**, com **uma exceção travada**: `semearVariacoes` aceita a repartição da Nuvemshop, e só quando o código é virgem e a soma da loja bate com o total nosso | duas travas, documentadas |
| Variação (quais existem) | **Nuvemshop**, para `origem='loja'` — reescritas do zero a cada rodada. **Local** para `origem='local'` | a distinção é o que impede a rodada da madrugada de apagar cadastro novo |
| Foto principal | ⚠️ **DUAS FONTES** | ordem de precedência implementada em `state.js`: tratada nossa → original nossa → `foto_url` anotada → `loja_fotos`. Em PROD, as duas primeiras nunca existem, então **de fato a fonte é a Nuvemshop** |
| Demais fotos | **Nuvemshop** (`loja_fotos`), sem concorrente | não temos galeria local |
| Publicado | **Nuvemshop**, via `produtos.url_loja` | `catalogo_publicacoes.estado='publicado'` existe no CHECK e **nunca é escrito** |
| ID Nuvemshop (produto) | **Nuvemshop** | e **não é guardado em `produtos`** — só em `loja_variantes.produto_id`, `loja_fotos.produto_id`, `produto_variacoes.produto_id` |
| ID Nuvemshop (variante) | **Nuvemshop**, `variante_id`, com índice único local | é a identidade estável do casamento |

---

## 3. Categorias — o retrato

**O que funciona:** a tabela é simples, a FK garante integridade, a derivação
por nome é honesta sobre ser palpite, e a duplicação com o painel legado é
testada em vez de escondida.

**O que falta, e é decisão de produto, não bug:**

- não há renomear, não há excluir, não há mesclar;
- não há normalização — `"Colar "`, `"colar"` e `"Colares"` criam três
  categorias distintas via `POST /api/categorias`;
- `'Outros'` acumula dois significados incompatíveis: é uma categoria real,
  semeada, e é ao mesmo tempo o código de "sem categoria" em **três** lugares
  (`faltasBasicas`, `pendenciasDePublicacao`, `analisarSincronizacao`, todos
  com `p.cat === 'Outros'`). Uma peça legitimamente "Outros" é tratada como
  incompleta para sempre;
- `editarProduto` **não valida** `cat` contra a tabela. Um PATCH com categoria
  inexistente cai na FK do D1 e volta como erro genérico, não como
  "categoria não existe";
- `importarProdutos` e `cadastrarNovos` **validam duas vezes, com o mesmo
  código escrito duas vezes**: categoria desconhecida vira aviso e cai para
  `'Outros'`.

---

## 4. Fotos e mídia — o retrato

**Uso real das tabelas (por leitura de código; contagens em PROD na seção 12):**

| Tabela / coluna | Escrita por | Lida por | Veredito |
|---|---|---|---|
| `loja_fotos` | `guardarGaleria` (sync + rota) | `state.js`, `fotosDoSku` | **ativa** |
| `fotos_orfas` | `stmtsOrfas` (só em `importarFotosDaLoja`) | `listarFotosOrfas`, painel | **ativa, mas só se alimenta pelo caminho que exige R2** |
| `produtos.foto_url` | `vincularFotosDaLoja`, `importarFotosDaLoja` | `state.js` | **ativa e, em PROD, a única que funciona** |
| `produtos.foto_original_*` | só caminhos com R2 | `state.js`, publicação | **inerte em PROD** |
| `produtos.foto_tratada_*` | só caminhos com R2 | publicação | **inerte em PROD** |
| `produtos.foto_status` | idem | painel | **preso em `sem_foto` em PROD** |
| `produto_variacoes.imagem_url` | `gravarRetratoDaLoja` | nada encontrado no backend | **espelho gravado e não lido** |
| `loja_variantes.imagem_url` | `variantes.js` | painel de variantes | ativa |

`fotos_orfas` merece uma frase própria: ela é **contada** por
`vincularFotosDaLoja` mas **enfileirada** só por `importarFotosDaLoja`. Como
esta última precisa de R2, em produção a fila de órfãs provavelmente está
vazia enquanto o relatório diz que existem órfãs. Não é bug — é a decisão
deliberada de "vincular não enche fila de decisão humana" encontrando um
ambiente onde o outro caminho não roda.

---

## 5. Publicação — o retrato

Estados que o sistema **realmente tem**:

- produto cadastrado localmente — sim (`produtos`, `status='ativo'`)
- produto incompleto — sim, e **calculado em quatro lugares diferentes**
- produto completo / pronto — sim, mesma ressalva
- publicado — sim, mas **inferido de `url_loja`**, não decidido aqui
- não publicado — sim, por ausência de `url_loja`
- disponível para venda — sim, mas com nome próprio: `casa` (`qtd` menos
  consignado em maleta aberta)
- sem estoque — sim (`casa <= 0`)
- arquivado — sim, com data e motivo
- pendente de sincronização — **parcialmente**: existe `relato.mudancas` e
  `semEmpurrar` por rodada, mas **não há coluna de "pendente" por produto**
- com erro — sim, em três campos separados: `foto_erro`, `preparo_erro`,
  `publicacao_erro` (este último nunca escrito)

Estados que **deveriam existir conceitualmente e não existem**:

- **despublicado.** Não há ato de tirar do ar. Um produto arquivado aqui
  continua publicado lá; o sync apenas para de empurrar estoque para ele
  (`WHERE status='ativo'`), deixando o número congelado na vitrine.
- **divergente.** Não existe estado que diga "o que a loja mostra difere do
  que decidimos" fora de uma rodada de sync em memória.
- **em publicação / publicando.** A máquina salta de `aprovado` para
  `publicado` sem um estado intermediário — e como não há executor, o salto
  nunca acontece.
- **publicação parcial.** Produto no ar sem foto, ou no ar com preço velho,
  não tem representação.

---

## 6. Nuvemshop — o que existe de verdade

`api/src/nuvemshop.js` expõe exatamente **três** operações:

| Operação | Método | Direção |
|---|---|---|
| `produtos()` | GET `/products` | leitura |
| `pedidos(desde)` | GET `/orders` | leitura |
| `atualizarEstoque(itens)` | PATCH `/products/stock-price` | **a única escrita** |

Logo, item por item do escopo pedido:

- **criação de produto na loja** — não existe. `analisarSincronizacao` produz
  a lista `criarNaLoja`, que é um **relatório**, não um comando;
- **atualização de produto** — não existe (nome, descrição, categoria);
- **publicação / despublicação** — não existe;
- **variantes** — leitura e espelho; nada é criado lá;
- **SKU** — leitura, usado para casar;
- **preço** — o endpoint usado é `stock-price`, mas **só o estoque é
  enviado**; preço nunca sai daqui;
- **estoque** — escrita absoluta, por variante quando há mais de uma, com
  freio (`syncLimiteMudancas`, `syncLimiteZerar`) e ordem obrigatória
  pull-antes-de-push;
- **fotos** — leitura e espelho; nenhum upload para a loja;
- **categorias** — nem leitura;
- **IDs externos** — guardados em `loja_variantes`, `loja_fotos`,
  `produto_variacoes`, e **não** em `produtos`;
- **sync** — `sync.js`, cron **desarmado** (`crons = []` desde 2026-08-22),
  logo só roda por chamada manual;
- **importação** — `/api/loja/importar` e `/api/loja/variantes/importar`;
- **reconciliação** — `reconciliacao.js` opera sobre estoque e planilha;
  **não** cobre categoria, foto nem publicação.

**Trava de escrita:** `NUVEMSHOP_WRITES_ENABLED`, fail-closed, checada
**antes do fetch** para qualquer POST/PUT/PATCH/DELETE. Em PROD está `"true"`;
em staging, `"false"`.

### Quem vence quando local ≠ Nuvemshop

Não há uma regra; há **cinco**, espalhadas:

1. **Estoque:** local vence, sempre — `empurrarEstoque` escreve o absoluto
   (`sync.js:765`).
2. **Estoque, exceção:** a loja vence uma única vez, para semear variação, com
   duas travas (`sync.js:703`).
3. **Quais variações existem:** a loja vence para `origem='loja'`; local vence
   para `origem='local'` (`sync.js:1027`).
4. **Publicado / URL / nome da loja / visível:** a loja vence, integralmente,
   a cada rodada (`sync.js:978`).
5. **Foto:** precedência em `state.js` — o nosso vence se existir, senão o
   dela. E `COALESCE(foto_origem, 'nuvemshop')` protege quem já subiu upload.

Nome, descrição, preço e categoria **não têm regra de conflito porque não têm
conflito possível**: nunca são escritos dos dois lados.

---

## 7. Banco — tabelas da Fase 4.5

**Ativas, escritas e lidas:**
`produtos`, `categorias`, `produto_variacoes`, `kit_componentes`,
`produtos_pendentes`, `sku_reservas`, `loja_snapshot`, `loja_variantes`,
`loja_fotos`, `catalogo_publicacoes`, `fotos_orfas`.

**Colunas ativas mas inertes em produção** (dependem de R2):
`produtos.foto_original_key|tipo|tam`, `foto_tratada_key|tipo|tam`,
`foto_status`, `foto_erro`.

**Colunas gravadas e nunca lidas:**
- `produto_variacoes.imagem_url` — espelho sem consumidor no backend;
- `catalogo_publicacoes.publicado_em`, `.publicacao_erro`, `.tentativas`
  (esta só incrementada por `repetir`, que exige um estado que ninguém
  escreve).

**Valores de domínio inalcançáveis:**
`catalogo_publicacoes.estado IN ('publicado','falhou_ao_publicar')` —
declarados no CHECK, **nunca gravados por nenhum caminho de código**.

**Duplicado conceitualmente:**
- "a foto da peça" mora em três lugares (§1.3);
- "o produto está na loja" mora em `produtos.url_loja` **e** em
  `loja_variantes` / `loja_fotos.produto_id`, que podem discordar entre
  rodadas.

**Sem coluna, e faz falta:** `produtos.produto_id_loja`. Hoje, para saber o id
externo de um produto, é preciso passar por `loja_variantes`.

**Legado real:** nenhum encontrado nesta área. `produtos.foto_url` parece
legado (foi anterior a `loja_fotos`) mas é, hoje, **a única camada de foto que
funciona em produção**.

---

## 8. Rotas e serviços

| Rota | Arquivo dono | Auth | Tabelas | Adapter externo |
|---|---|---|---|---|
| `GET /api/categorias` | `http/routes/catalogo.js` | bearer | `categorias` | — |
| `POST /api/categorias` | `http/routes/catalogo-comandos.js` | bearer | `categorias` | — |
| `GET /api/produtos/pendentes` | `catalogo.js` | bearer | `produtos_pendentes` | — |
| `POST/DELETE /api/produtos/pendentes` | `catalogo.js` | bearer | `produtos_pendentes` | — |
| `POST /api/produtos/importar` | `catalogo-comandos.js` | bearer | `produtos`, `movimentos`, `categorias` | — |
| `POST /api/produtos/novos/analisar\|cadastrar` | `catalogo.js` | bearer | `produtos`, `movimentos`, `produtos_pendentes`, `sku_reservas`, `loja_variantes` | — |
| `PATCH /api/produtos/:sku` | `catalogo-comandos.js` | bearer | `produtos` | — |
| `DELETE /api/produtos/:sku` | `produtos.js` | bearer | `produtos`, `movimentos`, `produto_variacoes`, `produtos_pendentes` | — |
| `GET /api/produtos/:sku/dependencias` | `produtos.js` | bearer | 8 tabelas (leitura) | — |
| `POST /api/produtos/:sku/arquivar\|desarquivar` | `produtos.js` | bearer | `produtos` | — |
| `GET/PUT /api/produtos/:sku/variacoes` | `variantes.js`,`produtos.js` | bearer | `produto_variacoes`, `movimentos` | — |
| `GET/PUT /api/produtos/:sku/componentes` | `estoque.js`,`catalogo-comandos.js` | bearer | `kit_componentes` | — |
| `GET /api/produtos/sku/checar\|auditoria`, `POST .../gerar` | `sku.js` | bearer | `produtos`, `sku_reservas`, `loja_variantes`, `produtos_pendentes` | — |
| `GET /api/produtos/:sku/fotos` | `fotos.js` | bearer | `loja_fotos` | — |
| `GET /api/fotos/orfas` · `POST /api/fotos/orfas/adotar` | `fotos.js` | bearer | `fotos_orfas`, `produtos` | R2 + HTTP externo |
| `POST /api/fotos/sincronizar` | `fotos.js` | bearer | `loja_fotos` | Nuvemshop (leitura) |
| `POST /api/fotos/vincular-da-loja` | `fotos.js` | bearer | `produtos` | Nuvemshop (leitura) |
| `POST /api/fotos/importar-da-loja` | `fotos.js` | bearer | `produtos`, `fotos_orfas` | Nuvemshop + R2 |
| `PUT /api/produtos/:sku/foto/:versao` | `fotos.js` | bearer | `produtos` | R2 |
| `DELETE /api/produtos/:sku/foto` | `fotos.js` | bearer | `produtos` | R2 |
| `POST /api/produtos/:sku/foto/fundo-branco` | `fotos.js` | bearer | `produtos` | R2 + `FOTO_FUNDO_URL` |
| `GET /api/produtos/:sku/foto/:versao` (assinada) | `http/routes/publicas.js` | **assinatura HMAC + expiração** | `produtos` | R2 |
| `GET /api/catalogo/publicacao` | `publicacao-catalogo.js` | bearer | `catalogo_publicacoes`, `produtos`, `maleta_itens` | — |
| `POST /api/catalogo/publicacao/:sku/preparar` | `publicacao-catalogo.js` | bearer | `catalogo_publicacoes`, `produtos` | `PREPARADOR_CATALOGO_URL` + R2 |
| `POST .../previa\|aprovar\|reabrir\|repetir` | `publicacao-catalogo.js` | bearer | `catalogo_publicacoes` | — |
| `POST /api/loja/importar` · `/api/loja/variantes/importar` | `catalogo-comandos.js`, `variantes.js` | bearer | `loja_snapshot`, `loja_variantes`, `produto_variacoes` | Nuvemshop |
| `POST /api/sync` · `/api/sync/analisar` | `sync.js` | bearer | ~10 tabelas | Nuvemshop (leitura + PATCH estoque) |
| `scheduled` (cron) | `index.js` | — | idem | idem — **desarmado** |

Todas as rotas de catálogo são `bearer`. A única exceção da área é a rota de
servir foto, que usa assinatura HMAC com expiração para poder ir num `<img
src>`.

**Interfaces:** todo o fluxo 4.5 vive **só no painel legado**
(`src/dashboard.tpl.html`, aba "Publicar na Nuvemshop", ~13.9 mil linhas). O
frontend React tem `estoque`, `estoque-total`, `maletas`, `nuvemshop`,
`reconciliacao`, `revendedoras` — **não tem catálogo, nem fotos, nem
publicação**.

---

## 9. Bugs, riscos e inconsistências

### 🔴 Risco real

**R1 — R2 ausente em produção trava a publicação inteira.** Ver §1.5. Não é
degradação: é um caminho que não pode ser percorrido até o fim. Qualquer plano
da 4.5 que dependa de `foto_tratada_key` precisa resolver isto primeiro.
`api/wrangler.toml`, `fotos-storage.js:47`.

**R2 — `excluirProduto` pode falhar no meio do batch por FK.**
`dependenciasDoProduto` bloqueia por `venda_itens`, `maleta_itens`,
`inventario_itens`, `kit_componentes` e `reconciliacao_itens`. Mas **16
tabelas** referenciam `produtos(sku)`. Ficam de fora dos bloqueios:
`catalogo_publicacoes`, `inventario_contagem`, `inventario_nao_identificado`,
`inventario_resultado` (as três criadas na **Fase 4.4**),
`saidas_sem_faturamento`, `garantia_trocas`, `personalizacao_modelos`,
`personalizacao_opcoes`, `venda_personalizacoes`,
`venda_personalizacao_itens`. Cenário concreto: uma peça que já teve prévia de
publicação e nenhuma venda passa em `podeExcluir: true`, o batch apaga
`movimentos` e falha no `DELETE FROM produtos` com erro de FK — resultado, o
produto perde o razão e continua existindo, quebrando `produtos.qtd ==
SUM(movimentos.qtd)`. `produtos.js:106`.

**R3 — `importarProdutos` não normaliza o SKU.** Faz `String(p.sku).trim()`,
enquanto `cadastrarNovos` faz `normSku`. O sistema tem, hoje, **duas
normalizações de SKU em caminhos de criação**. Um `br1234` da planilha ou
entra colidindo com o índice (erro 500 sem explicação) ou entra como produto
que a Nuvemshop nunca encontra. É exatamente o bug que o comentário do próprio
`sku.js` diz ter sido corrigido. `catalogo-comandos.js:47`.

**R4 — casamento loja↔catálogo compara chave normalizada com chave crua.**
`mapa` (de `mapearSkus`) tem chaves `normSku`; `lerFotosDaLoja › nossos` e
`gravarRetratoDaLoja › nossos` usam `produtos.sku` cru. Um produto gravado
fora da forma canônica some do casamento **em silêncio**: vira "só na loja",
sua foto vira órfã, e seu estoque nunca é empurrado. Sintoma indistinguível de
"produto realmente não está na loja". `fotos.js:90`, `sync.js:1004`.

**R5 — `gravarRetratoDaLoja` limpa antes de reescrever, sem transação.**
`UPDATE produtos SET url_loja=NULL, estoque_loja=NULL, visivel=NULL` roda na
tabela inteira e depois os `INSERT`s repovoam em lotes de 100. Uma falha entre
os lotes deixa parte do catálogo "não publicado". Como `estadoDoItem` deriva
`publicado` de `url_loja`, o efeito colateral é a **tela de publicação mudar
de estado por causa de uma falha de rede**. `sync.js:1010`.

**R6 — `gerarFundoBranco` pode estourar a pilha em foto grande.**
`btoa(String.fromCharCode(...new Uint8Array(bytes)))` espalha um argumento por
byte. Com o limite de 8 MB do próprio `fotos-storage.js`, isso é milhões de
argumentos — `RangeError: Maximum call stack size exceeded`, capturado pelo
`catch` e gravado como `foto_status='erro'`. A peça fica marcada como erro de
tratamento quando o erro é de codificação. `fotos.js:466`.

**R7 — a regra de "peça completa" existe em quatro cópias que discordam.**

| Local | Preço | Quantidade | Nome |
|---|---|---|---|
| `fotos.js › pendenciasDePublicacao` | `preco == null` | `casa<=0` **exclui da lista** | `desc.trim() === sku` |
| `publicacao-catalogo.js › faltasBasicas` | `preco == null \|\| preco <= 0` | `casa<=0` **é falta** | `normSku(desc) === normSku(sku)` |
| `sync.js › analisarSincronizacao` | `preco == null` | `casa<=0` exclui | `desc.trim() === sku` |
| painel legado `LISTAS_PUB` | própria | própria | própria |

Uma peça com `preco = 0` é "pronta para publicar" em uma tela e "falta preço"
na outra. `preco = 0` não deveria existir por §24, mas nada no schema o
impede.

### ⚠️ Dívida técnica

- **D1** — `editarProduto` não valida `cat` nem `status`; qualquer string
  entra em `status` (não há CHECK no schema), e categoria inválida vira erro
  de FK sem mensagem útil.
- **D2** — sem rota de renomear/excluir/mesclar categoria; sem normalização de
  nome de categoria.
- **D3** — `'Outros'` significa duas coisas ao mesmo tempo (§3).
- **D4** — `catalogo_publicacoes` tem dois estados no CHECK que nenhum código
  escreve, e três colunas nunca lidas. Um leitor do schema conclui que a
  publicação funciona.
- **D5** — `importarFotosDaLoja` grava no R2 dentro do laço e no D1 só no fim.
  Uma falha entre os dois deixa bytes no bucket sem referência.
- **D6** — `catalogo-comandos.js` ainda devolve `Response` em vez de resultado
  puro; é o resto da Fase 2 que a Fase 4 deveria terminar (o próprio cabeçalho
  do arquivo diz isso).
- **D7** — `importarProdutos` e `cadastrarNovos` repetem a validação de
  categoria e a de preço, com o mesmo código escrito duas vezes.
- **D8** — `produto_variacoes.imagem_url` é gravada e não lida.
- **D9** — não há `produtos.produto_id_loja`; o id externo do produto só existe
  por caminho indireto.

### ℹ️ Comportamento atual (não é bug, é decisão registrada)

- Publicação para antes da loja por desenho (`CAT-06`).
- Cron desarmado desde o go-live; sync só por chamada manual.
- Excluir aqui nunca exclui da Nuvemshop, e a resposta diz isso.
- Foto sem correspondência vai para fila humana em vez de ser chutada.
- `vincular` não enche a fila de órfãs; só `importar` enche.
- Variação nunca é adivinhada; conflito derruba o código inteiro da rodada.
- A publicação exige aprovação humana com assinatura dos dados, e qualquer
  mudança nos dados invalida a aprovação.

---

## 10. Legados

Nada nesta área é legado morto. O que **parece** legado e não é:

- `produtos.foto_url` — anterior a `loja_fotos`, e hoje a única camada viva
  em PROD;
- `produto_variacoes.atributo` (nomes concatenados) — mantida porque é o que
  a tela legada lê, ao lado de `valores_json` que é a estrutura correta;
- `CAT_MAP` duplicado no painel — duplicação declarada e testada.

O legado de verdade é **o painel**: todo o fluxo 4.5 só existe em
`src/dashboard.tpl.html`. Reescrever a 4.5 sem reescrever essa tela deixa o
sistema sem interface para a fase.

---

## 11. Necessidades de UX que o domínio exige

Fatos que a interface nova **precisa conseguir representar** — não é desenho,
é o que o domínio obriga:

**Por peça**
1. tem foto nossa · tem só o endereço da foto da loja · não tem foto nenhuma
   (são três estados, não dois);
2. tem fundo branco tratado, ou não — e, se não, **se o serviço está sequer
   disponível** (bloqueio de infraestrutura ≠ pendência de trabalho);
3. quantas fotos a loja mostra, e qual é a principal;
4. publicado / não publicado, e que "publicado" é um fato lido da loja, não
   uma decisão nossa;
5. o que falta para publicar, item a item (foto, fundo, nome, categoria,
   preço, quantidade em casa) — **uma lista só, não quatro**;
6. tem variação · quantas · alguma sem `variante_id` (não empurra estoque);
7. é kit · é componente de kit;
8. total em estoque **e** quanto está em casa (o consignado não é publicável);
9. sem preço é bloqueio, não aviso;
10. arquivado, com data e motivo;
11. está na loja mas não conhecemos o código (só na loja) · conhecemos e a
    loja não tem (candidato a criar);
12. a aprovação anterior foi invalidada porque os dados mudaram.

**Por categoria**
13. quantas peças cada categoria tem;
14. quais categorias não têm peça nenhuma;
15. que renomear e excluir **não são possíveis hoje** — a tela não pode
    oferecer um botão que a API não tem;
16. que `'Outros'` é tratado como "sem categoria" pelo funil de publicação.

**Por lote / operação**
17. o que a próxima sincronização faria, antes de autorizar (já existe:
    `/api/sync/analisar`);
18. o que ela **decidiu não fazer**, com o motivo por peça (`semEmpurrar`);
19. fotos órfãs esperando decisão;
20. peças novas na fila esperando aprovação de lote;
21. que nenhum ato desta tela escreve na Nuvemshop além de estoque.

**Estados de erro que precisam de lugar próprio**
22. erro de foto (`foto_erro`) ≠ erro de preparação (`preparo_erro`) ≠ erro de
    publicação (`publicacao_erro`);
23. "o serviço externo não está configurado" é diferente de "falhou".

---

## 12. Medições de PROD que faltam

> **MEDIÇÃO DE PROD NECESSÁRIA** — nenhuma foi feita nesta auditoria.
> Caminho seguro registrado no projeto:
> `npx wrangler d1 export DB --remote -c api/wrangler.toml --output <scratchpad>/prod.sql`
> (leitura, passa nas travas; o dump tem CPF e telefone — nunca no repositório).

1. `SELECT COUNT(*) FROM loja_fotos` — a tabela está povoada ou vazia?
2. `SELECT COUNT(*) FROM fotos_orfas` — a hipótese de §4 é que esteja vazia.
3. `SELECT COUNT(*) FROM catalogo_publicacoes GROUP BY estado` — a máquina de
   estados chegou a ser usada em produção?
4. `SELECT foto_status, COUNT(*) FROM produtos GROUP BY foto_status` e
   `COUNT(foto_original_key)`, `COUNT(foto_tratada_key)` — confirmar que R2
   nunca gravou nada em PROD.
5. `SELECT COUNT(*) FROM produtos WHERE foto_url IS NOT NULL` — a memória do
   projeto cita 629 códigos vinculados; confirmar.
6. `SELECT cat, COUNT(*) FROM produtos GROUP BY cat` + `SELECT nome FROM
   categorias` — quantas categorias existem além das 9 semeadas, quantas estão
   órfãs, e qual o tamanho real de `'Outros'`.
7. `SELECT COUNT(*) FROM produtos WHERE sku <> UPPER(REPLACE(sku,' ',''))` —
   mede o risco **R4** diretamente. Se der zero, R4 é teórico.
8. `SELECT COUNT(*) FROM produtos WHERE preco = 0` — mede **R7**.
9. `SELECT COUNT(*) FROM produtos WHERE url_loja IS NOT NULL` — quantos estão
   publicados de fato, e comparar com a contagem de produtos ativos.
10. `SELECT COUNT(*) FROM produto_variacoes WHERE origem='local'` — quanto de
    estrutura local existe que a loja não conhece.
11. Confirmar no schema real que `catalogo_publicacoes` e `loja_fotos`
    **existem** em PROD (o código trata a ausência com `try/catch`, então uma
    tabela faltando é invisível).
12. Nuvemshop: quantos produtos, quantas imagens, quantas categorias existem
    lá — e se a loja usa categorias de forma que valha a pena mapear.

---

## 13. Decisões que dependem de Gustavo e Sthefany

**Decisões técnicas que eu posso tomar sozinho** (registradas, não
perguntadas): consertar R2–R7, unificar as quatro cópias da regra de
completude num único módulo, completar `dependenciasDoProduto`, extrair
`catalogo-comandos.js` para resultado puro, acrescentar validação de `cat` e
`status`, e desenhar a separação Catálogo / Mídia / Publicação da seção 14.

**Decisões de negócio que eu não vou tomar:**

1. **R2 vale a pena?** Habilitar R2 na conta Cloudflare custa dinheiro e é o
   que destrava foto própria, fundo branco e a publicação inteira. A
   alternativa é assumir que a Nuvemshop é a dona das fotos e reescrever a
   4.5 sem foto local. *São dois sistemas diferentes.*

2. **Publicar de verdade, ou continuar preparando?** Ligar o executor
   significa criar produto na Nuvemshop a partir daqui. Quero uma resposta
   explícita: sim, com aprovação peça a peça? Sim, em lote? Ou não, e a
   publicação continua sendo feita à mão na Nuvemshop e apenas *observada*
   aqui?

3. **Categorias: quem manda?** Hoje as categorias daqui e as da loja não se
   falam. Deveriam? Se sim, quem vence?

4. **Renomear categoria: precisa?** Se sim, o nome deixa de poder ser a chave
   primária — é migration de verdade, e mexe em `produtos.cat`.

5. **`'Outros'` é uma categoria ou é a ausência de categoria?** Se for
   categoria legítima, o funil de publicação precisa parar de tratá-la como
   pendência. Se for ausência, ela precisa de outro nome.

6. **Peça com preço 0 existe?** (Brinde, cortesia, componente.) Se não existe,
   o banco pode proibir. Se existe, ela é publicável?

7. **Despublicar é um ato?** Arquivar aqui não tira a peça da loja hoje.
   Deveria tirar? Automático ou com confirmação?

8. **Preço: a Nuvemshop pode ter preço diferente?** Hoje pode, e ninguém olha.
   Isso é promoção legítima ou é divergência a reconciliar?

9. **Descrição comercial: quem escreve?** O agente (`PREPARADOR_CATALOGO_URL`,
   que não está configurado) ou a Sthefany na mão? O código suporta os dois; o
   fluxo precisa escolher um como padrão.

10. **Galeria própria: precisamos?** Hoje guardamos duas imagens por peça
    (original e tratada). A loja tem várias. A Sthefany fotografa mais de uma
    por peça?

---

## 14. Proposta de desenho técnico da 4.5

Proposta, não implementação. Segue a ordem do Master Plan § 30 (contratos
antes de persistência) e não propõe schema novo sem necessidade provada.

### 14.1 Três domínios, não um

O erro a evitar é tratar "catálogo" como uma coisa só. São três, com
autoridades diferentes:

```
Catálogo    identidade e ficha da peça: SKU, nome, categoria, preço, status
            → dono de produtos (identidade), categorias, sku_reservas

Mídia       os bytes e os endereços de imagem
            → dono de produtos.foto_* + R2 + loja_fotos + fotos_orfas

Publicação  o rascunho comercial, a aprovação e o estado externo
            → dono de catalogo_publicacoes; orquestra Catálogo e Mídia,
              e é o ÚNICO que pode falar em "publicado"
```

`Estoque` continua dono de `produtos.qtd` — a tensão de `produtos` descrita no
baseline não se resolve nesta fase, e não deve.

### 14.2 Um único juiz de completude

Substituir as quatro cópias por um módulo só:

```
catalogo/completude.js
  faltasDaPeca(peca) -> ['foto'|'fundo_branco'|'nome'|'categoria'|'preco'|'quantidade']
```

Chamado por `pendenciasDePublicacao`, `faltasBasicas`,
`analisarSincronizacao` e servido à tela. Uma definição, um teste, e a
divergência de `preco = 0` some por construção. **Custo baixo, ganho alto —
é o primeiro passo que eu faria.**

### 14.3 Normalização de SKU: um caminho só

`importarProdutos` passa a usar `normSku`, como `cadastrarNovos`. E um teste
de caracterização prova que os dois caminhos de criação produzem a mesma
chave. Fecha R3 e R4 na origem.

### 14.4 `dependenciasDoProduto` derivada, não digitada

Em vez de listar tabelas à mão (e esquecer as três que a 4.4 criou), consultar
`pragma_foreign_key_list` e verificar cada referência a `produtos`. Uma fase
futura que acrescente tabela passa a ser coberta sozinha. Fecha R2.

### 14.5 Publicação: separar "preparado" de "publicado"

- `catalogo_publicacoes` continua sendo o **rascunho e a aprovação** — estado
  interno, decidido aqui;
- "publicado" deixa de ser um valor daquele CHECK e passa a ser explicitamente
  um **fato observado**, derivado do espelho da loja;
- os dois estados mortos (`publicado`, `falhou_ao_publicar`) só voltam a fazer
  sentido quando existir executor. Enquanto não existir, o CHECK mente para
  quem lê o schema.

### 14.6 Executor de publicação, se autorizado

Se a decisão 13.2 for "sim", o desenho é o mesmo do push de estoque, que já
provou funcionar: adapter isolado, dry-run obrigatório, freio por volume,
idempotência por assinatura (`dados_assinatura` já existe e já serve
exatamente para isso), e escrita gateada por `NUVEMSHOP_WRITES_ENABLED`. **Não
antes de R2 estar decidido** — o executor precisaria mandar a imagem.

### 14.7 Mídia: encarar o cenário sem R2

Se a decisão 13.1 for "não habilitar R2", a 4.5 precisa de um segundo caminho
de completude em que **a foto da loja conta como foto**. Isso é uma mudança de
regra de negócio (hoje `faltasBasicas` exige `foto_original_key` **ou**
`foto_tratada_key`, e `loja_fotos` não conta), não um ajuste de código — por
isso está na seção 13 e não aqui.

### 14.8 Categorias

Enquanto 13.3–13.5 não forem respondidas, o mínimo defensável é:
normalizar o nome na entrada (`trim` + colapso de espaço), validar `cat` em
`editarProduto` com mensagem própria, e expor a contagem de peças por
categoria para a tela poder mostrar as órfãs. Renomear e excluir ficam fora
até a decisão sobre a chave primária.

### 14.9 Ordem sugerida

```
0. medir PROD (seção 12) — sem isso, metade das decisões é chute
1. juiz único de completude          (14.2)  · sem migration
2. normalização única de SKU         (14.3)  · sem migration
3. dependências derivadas do schema  (14.4)  · sem migration
4. R5, R6, D5 — falhas parciais e codificação   · sem migration
5. decisões humanas da seção 13
6. só então: contratos de Catálogo / Mídia / Publicação
7. só então, e só se autorizado: executor de publicação
```

Os passos 1 a 4 são reparos com teste, sem schema e sem risco de dados.
**Do 5 em diante nada acontece sem decisão humana.**

---

*Auditoria encerrada. Nenhum código foi escrito, nenhuma migration criada,
nenhum deploy feito, nenhuma branch reconciliada.*
