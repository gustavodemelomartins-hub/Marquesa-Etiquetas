# Catálogo, Mídia e Publicação — Fase 4.5

Documento canônico da Fase 4, item 5 do
[Master Plan](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md) § 30.
Parte da [auditoria de 10/09/2026](AUDITORIA-4-5-CATALOGO-FOTOS-PUBLICACAO.md)
e das decisões de produto tomadas por Gustavo em **10/09/2026**, que estão
registradas aqui porque mudam a direção de autoridade do sistema.

> **A decisão que governa tudo abaixo:** o produto **nasce no Sistema
> Marquesa**. A Nuvemshop deixa de ser o lugar onde o cadastro comercial é
> criado e passa a ser **um canal externo de publicação e venda**.

Isso não remove importação nem reconciliação. Remove a ambiguidade sobre
quem manda.

---

## 1. O fluxo-alvo

```
cadastro local → categoria → variações → preço → fotos originais
      → preparação de conteúdo → aprovação humana
      → publicação na Nuvemshop → sincronização / reconciliação
```

Cada seta é um estado representável. Nenhuma delas é inferida de efeito
colateral: a auditoria encontrou "publicado" derivado de `produtos.url_loja`,
e o § 10 abaixo separa o que **decidimos** do que **observamos**.

---

## 2. Autoridade por campo

Duas perguntas diferentes, e confundi-las foi o defeito da modelagem antiga:

| | Pergunta | Onde mora |
|---|---|---|
| **Origem histórica** | de onde este cadastro veio? | `produtos.origem_cadastro` |
| **Autoridade atual** | quem manda nele hoje? | `produtos.autoridade` |

Um produto importado da loja em 2024 tem `origem_cadastro='loja'` para
sempre — é fato histórico e não se reescreve. A autoridade dele pode
migrar para `marquesa` no dia em que alguém assumir a ficha aqui.

| Campo | Autoridade | Observação |
|---|---|---|
| SKU | **Marquesa** | `sku.js › normSku`, normalização única |
| Nome | **Marquesa** | `produtos.desc`; `nome_loja` é espelho |
| Descrição comercial | **Marquesa** | `catalogo_publicacoes.descricao_site` |
| Categoria | **Marquesa** | `categorias`, identidade estável em `categorias.id` |
| Preço base | **Marquesa** | `produtos.preco`; § 11 registra a política pendente |
| Estoque | **Marquesa / razão** | `estoque.js › movimentar` continua único dono |
| Variações locais | **Marquesa** | `produto_variacoes.origem='local'` |
| Fotos próprias | **Marquesa** | `produto_fotos` + R2 |
| Ordem da galeria | **Marquesa** | `produto_fotos.ordem`, `principal` |
| Estado de publicação | **Marquesa** | `catalogo_publicacoes.estado` |
| ID Nuvemshop | referência externa | `produtos.produto_id_loja`, `variante_id`, `imagem_id_loja` |
| Presença na vitrine | **observada** | `produtos.url_loja` — fato lido, nunca decisão |

**Compatibilidade:** nada acima invalida produto histórico. As 790 peças de
produção continuam legíveis, e o § 13 registra a prova.

---

## 3. Três domínios, não um

```
Catálogo    identidade e ficha: SKU, nome, categoria, preço, status
Mídia       os bytes e os endereços de imagem: produto_fotos + R2 + espelhos
Publicação  o rascunho comercial, a aprovação e o estado externo
```

`Estoque` continua dono de `produtos.qtd`. A Fase 4.5 não mexe nisso.

---

## 4. Juiz único de completude

A auditoria encontrou **quatro** definições de "peça completa" que
discordavam entre si (R7). Elas são substituídas por um módulo só:

```
api/src/catalogo/completude.js
  faltasDaPeca(peca, capacidades) -> { faltas, bloqueios }
```

- **`faltas`** é trabalho humano: `nome`, `categoria`, `preco`,
  `quantidade`, `foto`.
- **`bloqueios`** é infraestrutura ausente: `sem_r2`, `sem_preparador`.

São listas separadas porque a pergunta que a tela faz é diferente — "o que
eu preciso fazer?" contra "o que o sistema não consegue fazer?" (necessidade
de UX 23 da auditoria).

Regras, uma vez só:

| Falta | Quando |
|---|---|
| `nome` | `desc` vazio ou `normSku(desc) === normSku(sku)` |
| `categoria` | categoria ausente **ou** a sentinela `Sem categoria` |
| `preco` | `preco == null` **ou** `preco <= 0` |
| `quantidade` | `casa <= 0` (o consignado não é publicável) |
| `foto` | nenhuma imagem em lugar nenhum: nem galeria própria, nem `foto_url`, nem `loja_fotos` |

**`Outros` deixa de ser falta.** É categoria real (§ 5). Um produto
legitimamente "Outros" passa a ser publicável — mudança de comportamento
deliberada, medida em produção: afeta **3 peças**.

**`foto_tratada_key` deixa de ser gate.** Era o nó que travava a fase
inteira (R1): PROD não tem R2, logo nenhum produto alcançava
`aguardando_aprovacao`. Foto preparada continua sendo objetivo do pipeline,
mas a ausência dela é `bloqueio`, não `falta` — e some sozinha quando o
binding chegar.

---

## 5. Categorias

Decisões fechadas:

- **`Outros` é categoria real.** Nunca mais é código para ausência.
- **`Sem categoria` é um estado próprio**, com linha sentinela
  (`sentinela = 1`), porque `produtos.cat` é `NOT NULL` e torná-la anulável
  exigiria reconstruir a tabela.
- **O nome deixa de ser a identidade.** `categorias.id` é estável; o nome é
  atributo.

A evolução é aditiva: `categorias` ganha `id`, `slug`, `nome_norm`,
`sentinela`, `arquivada_em`, `sucessora_id`, `criada_em`. A PK continua
sendo `nome` — `produtos.cat` continua sendo a FK — porque trocar a PK
exigiria reconstruir `categorias` **e** `produtos`.

Renomear passa a ser possível como ato atômico, dentro de um `db.batch`
(que no D1 é transação):

```
1. marca a linha antiga como arquivada   (sai do índice único parcial de id)
2. insere a linha nova com o MESMO id
3. UPDATE produtos SET cat = novo WHERE cat = antigo
4. DELETE da linha antiga                (já não tem filho)
```

Índices que fazem o banco garantir o que o código promete:

```sql
CREATE UNIQUE INDEX idx_categorias_id_viva   ON categorias(id)        WHERE arquivada_em IS NULL;
CREATE UNIQUE INDEX idx_categorias_nome_viva ON categorias(nome_norm) WHERE arquivada_em IS NULL;
```

O segundo fecha D2: `"Colar "`, `"colar"` e `"Colar"` passam a ser a mesma
categoria. `"Colares"` continua sendo outra — normalizar plural seria
adivinhar.

Mesclar fica preparado (`sucessora_id`) e **não implementado**: mesclar é
decisão comercial sobre o catálogo, não operação técnica.

---

## 6. Mídia: a galeria é nossa

A auditoria encontrou **duas** imagens por peça (`original`, `tratada`) do
nosso lado, e a galeria inteira só do lado da loja. O modelo novo inverte:

```sql
produto_fotos(id, sku, ordem, principal, origem, arquivo_nome, lote_id,
              original_key|tipo|tam|em,
              preparada_key|tipo|tam|em,
              aprovada_em|por, publicada_em, imagem_id_loja,
              url_externa, estado, erro, criado_em)
```

- **o original nunca é sobrescrito.** A chave do R2 passa a ser
  `produtos/<sku>/<fotoId>/original`; trocar a foto cria outra linha, não
  apaga a anterior. Registrar a versão preparada escreve `preparada_key` e
  **não encosta** em `original_key`.
- **uma principal por peça, garantida pelo banco:**
  `CREATE UNIQUE INDEX ... ON produto_fotos(sku) WHERE principal = 1`.
- **ordem determinística:** `ORDER BY principal DESC, ordem, criado_em, id`.
  Nunca "a primeira que veio".
- **estado por imagem:** `original → preparada → aprovada → publicada`.

As três camadas antigas continuam existindo e continuam respondendo
perguntas diferentes: `loja_fotos` é o espelho da vitrine, `produtos.foto_url`
é o endereço anotado, e as colunas `produtos.foto_*_key` continuam válidas
para quem já as usa. A galeria própria é a **quarta** camada — e é a única
onde a Marquesa é autoridade.

### 6.1 R2

O binding `FOTOS` continua ausente em produção (erro 10042). O que muda:

- o código para de **exigir** R2 para avançar de estado (§ 4);
- a configuração fica pronta para receber o binding por release controlado —
  `api/wrangler.toml` documenta o bloco exato, comentado, e
  `lerConfig(env).fotos.temR2` já distingue os dois mundos;
- toda rota que precisa dos bytes recusa com `bloqueio: 'sem_r2'`, que é
  diferente de erro.

**Nada é habilitado nesta fase.**

---

## 7. Upload em lote

Muitas fotos de uma vez, identificadas pelo **nome do arquivo**.

```
132721.jpg  132721_1.jpg  132721_2.jpg  132721-frente.jpg  132721-detalhe.jpg
```

O extrator (`api/src/catalogo/nome-de-arquivo.js`) **não remove sufixo `-N`
globalmente**. A convenção histórica de planilha (`212223-2` = segunda
compra) pertence ao importador de histórico, não ao identificador genérico
de foto — ver [SKU-SUFIXO-DE-COMPRA.md](SKU-SUFIXO-DE-COMPRA.md). O que ele
faz é procurar, **do mais específico para o menos**:

1. o nome inteiro, normalizado por `normSku`;
2. o pedaço antes do primeiro `_`;
3. o pedaço antes do primeiro `-`.

O primeiro que existir no catálogo vence. Se **dois** candidatos existirem
como produto (`212223-2` e `212223` ambos cadastrados), o item vira
`nome_ambiguo` e **para** — adivinhar aqui faria a vitrine anunciar uma peça
mostrando outra.

Estados de item de lote, todos representáveis:

| Situação | Significa |
|---|---|
| `vinculado` | casou com um produto |
| `multiplas` | é a 2ª, 3ª… imagem do mesmo SKU no lote — agrupada, não descartada |
| `sku_nao_encontrado` | o código não existe no catálogo |
| `nome_ambiguo` | mais de um produto poderia ser o dono |
| `nome_invalido` | o nome não produz candidato nenhum |
| `duplicado` | mesmo arquivo (ou mesmos bytes) já registrado |
| `erro_upload` | o R2 recusou ou não respondeu |

O lote **analisa antes de confirmar**: `POST .../lotes` devolve o casamento
e não grava byte nenhum. `POST .../lotes/:id/confirmar` é o ato. Um arquivo
inválido nunca derruba o lote — ele vira linha em `fotos_lote_itens` com o
motivo, e os outros seguem.

---

## 8. Preparação: fronteira, não fornecedor

O ERP **não sabe** quem prepara o conteúdo. Sabe que existe uma tarefa.

```
Sistema Marquesa → tarefa de preparação → executor externo
                 → resultado preparado → aprovação humana
```

```sql
preparacao_tarefas(id, sku, estado, campos_json, resultado_json,
                   executor, entregue_em, concluida_em, erro, tentativas, …)
```

`executor` é **rótulo livre** (`humano`, `assistido`, `servico:<nome>`).
Nenhuma linha do domínio menciona OpenAI, ChatGPT ou Codex, e trocar o
executor não redesenha nada. Hoje o executor real é humano-assistido: a
Sthefany pede "prepare todos os produtos novos de hoje" na ferramenta que já
usa, lê `GET /api/catalogo/preparacao/tarefas?estado=pendente` e devolve o
resultado por `POST .../resultado`.

Estados: `pendente → entregue → concluida | falhou | cancelada`.
Concluir uma tarefa grava o rascunho e leva a peça a `aguardando_aprovacao`.
**Nunca publica.**

Integração com API de fornecedor: **não implementada nesta fase**, por
decisão explícita.

---

## 9. Aprovação humana é invariante

```
executor prepara → aguardando_aprovacao → Sthefany revisa
   → [pedir ajuste] ou [aprovar] → só então: publicação
```

Nada preparado por agente chega à Nuvemshop sem aprovação. A trava já
existente e mantida é a **assinatura dos dados** (`dados_assinatura`):
mudou nome, categoria, preço, quantidade em casa ou a foto aprovada, a
aprovação anterior é invalidada automaticamente.

---

## 10. Publicação: estados vivos, escrita desligada

A máquina de estados passa a ser:

| Estado | Quem escreve |
|---|---|
| `falta_informacao` | calculado (§ 4), nunca persistido |
| `pronto_para_preparacao` | calculado |
| `em_preparacao` | abertura de tarefa |
| `preparado` | resultado do executor |
| `aguardando_aprovacao` | rascunho completo |
| `aprovado_para_publicar` | `aprovar`, com assinatura |
| `publicando` | o executor de publicação, ao pegar o item |
| `publicado` | o executor de publicação, ao confirmar |
| `falhou_ao_publicar` | o executor de publicação, ao falhar |
| `despublicado` | o ato de tirar do ar |

Os dois estados mortos da auditoria (`publicado`, `falhou_ao_publicar`)
ganham **writer real**: `api/src/catalogo/publicador.js`. E o writer nasce
com três travas em série, todas fail-closed:

1. `NUVEMSHOP_WRITES_ENABLED` — a trava central que já existe;
2. `NUVEMSHOP_PUBLICACAO_ENABLED` — nova, específica desta escrita, **não
   declarada em `wrangler.toml`**, logo desligada em todo ambiente;
3. `seco` por padrão: publicar de verdade exige `{"seco": false}` explícito.

`presencaNaLoja` (derivada de `url_loja`) continua existindo ao lado do
estado, e a resposta diz qual é qual. "A loja mostra" e "nós decidimos" são
fatos diferentes e nunca mais compartilham um campo.

---

## 11. Preço local × preço da loja — **decisão pendente**

Não fechada por Gustavo, e **não decidida aqui**. O sistema passa a
**medir** a divergência (`precoLocal`, `precoLoja`, `divergente`) e não
conclui nada: diferença não é declarada erro, não gera alarme e não
dispara correção. Quando a política existir — preço base, promocional,
preço específico da loja — ela terá o número para decidir.

---

## 12. Dívidas da auditoria tratadas

| Achado | Tratamento |
|---|---|
| R1 R2 ausente trava a fase | `foto_tratada_key` deixa de ser gate (§ 4) |
| R2 exclusão quebra a razão | dependências derivadas de `pragma_foreign_key_list` |
| R3 `importarProdutos` sem `normSku` | passa pela função canônica |
| R4 casamento cru × normalizado | `nossos` passa a ser indexado por `normSku` |
| R5 `url_loja=NULL` global | limpa só quem sumiu, e recusa retrato truncado |
| R6 `btoa` estoura a pilha | codificação em blocos |
| R7 quatro regras de completude | juiz único (§ 4) |
| D1 `editarProduto` não valida | valida `cat` e `status` com mensagem própria |
| D2 categoria sem normalização | `nome_norm` + índice único parcial |
| D3 `Outros` com dois sentidos | sentinela `Sem categoria` |
| D4 estados mortos no CHECK | writer real + CHECK reconstruído |
| D5 bytes no R2 sem referência | a linha da foto nasce antes do upload |
| D8 `imagem_url` gravada e não lida | exposta na galeria |
| D9 sem `produto_id_loja` | coluna aditiva em `produtos` |

---

## 13. Medições de produção (10/09/2026)

Somente leitura, por `wrangler d1 export DB --remote`, analisado em SQLite
local. O dump tem CPF e telefone — nunca entra no repositório.

| Medida | Valor |
|---|---|
| produtos | 790 (787 ativos, 3 inativos, 0 arquivados) |
| `loja_fotos` | **0 linhas** |
| `fotos_orfas` | **0 linhas** |
| `catalogo_publicacoes` | tabela existe, **0 linhas** |
| `foto_original_key` / `foto_tratada_key` | **0 / 0** — R2 nunca gravou |
| `foto_status` | 772 `sem_foto`, 18 `NULL` |
| `produtos.foto_url` | 629, todos `foto_origem='nuvemshop'` |
| categorias | 9, todas semeadas, **nenhuma órfã**; `Outros` = 3 peças |
| SKU fora da forma canônica | **0** — R4 é risco teórico hoje |
| SKU com hífen | 1 (`MONTE-COLAR`, legítimo) |
| `preco = 0` | **0**; `preco IS NULL` = 3 |
| `url_loja IS NOT NULL` | 627 |
| `produto_variacoes` | 82 linhas, 27 SKUs, **todas `origem='loja'`**, todas com `variante_id` |
| tabelas que referenciam `produtos` | **16 FKs em 14 tabelas** (a exclusão bloqueava por 5) |
| razão `produtos.qtd == SUM(movimentos.qtd)` | **fecha, 0 divergências** |
| candidatos a publicar (ativo, sem `url_loja`) | **160**, dos quais 140 com peça em casa |
| desses, sem imagem em lugar nenhum | **158 de 160** |

A última linha é o fato que decide a fase: **as peças que ainda não estão na
loja não têm foto em lugar nenhum**. A loja não pode ser a fonte da imagem
delas, porque elas não estão lá. Foto própria — logo R2 — é o único caminho.

**Não medido:** o lado da Nuvemshop (quantos produtos, imagens e categorias
existem lá). Exigiria o token real e uma chamada externa; ficou de fora por
opção de segurança. O espelho `loja_snapshot` de 06/09 registra 610 produtos,
606 casados, 4 só na loja.

---

## 14. O que esta fase NÃO faz

Por decisão explícita: API da OpenAI, geração de imagem, automação real do
executor, agente autônomo, frontend React novo, redesign visual e deploy em
produção. A arquitetura fica pronta para todos eles.

---

## 15. Decisões humanas ainda pendentes

1. **Preço divergente local × loja** (§ 11) — qual é a política?
2. **Mesclar categorias** — quando duas categorias viram uma, o que acontece
   com o histórico de relatório?
3. **Despublicar automaticamente ao arquivar?** Hoje arquivar aqui não tira
   a peça do ar; o ato de despublicar passa a existir, mas não é automático.
4. **Habilitar R2 em produção** — custo e release controlado.
5. **Ligar a escrita de publicação** — `NUVEMSHOP_PUBLICACAO_ENABLED`.
6. **Categorias da loja** — hoje ignoradas dos dois lados. Mapear ou não?
