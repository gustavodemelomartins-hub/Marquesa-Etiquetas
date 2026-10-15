-- Marquesa — Catálogo, Mídia e Publicação
-- Fase 4, item 5.  Data: 2026-09-10
-- Desenho canônico: docs/domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md
--
-- Migration Classe C. Quase toda ADITIVA: dez `ADD COLUMN`, cinco
-- `CREATE TABLE`, sete índices e um backfill que só preenche coluna nova.
--
-- A reconstrução de `catalogo_publicacoes` NÃO está aqui: ela não é
-- idempotente e por isso mora em `api/migracao-catalogo-4-5-publicacao.sql`,
-- que roda UMA vez. Este arquivo é o que pode rodar sempre.
-- Rollback: `api/migracao-catalogo-4-5-rollback.sql`.
--
-- Rodar duas vezes é inofensivo: todo `CREATE` é `IF NOT EXISTS`, todo
-- backfill é condicionado, e os `ADD COLUMN` repetidos devolvem
-- "duplicate column name" — que o aplicador do projeto ignora, como já faz
-- com `migracao-inventario-4-4.sql`.

-- ══════════════════════════════════════ 1. CATEGORIAS: identidade estável
--
-- Hoje a identidade da categoria é o NOME, e ele é PRIMARY KEY referenciada
-- por `produtos.cat`. Isso torna "renomear" impossível pela API: mudar o
-- nome é mudar a chave, e mudar a chave derrubaria a FK dos filhos.
--
-- A PK continua sendo `nome` — trocá-la exigiria reconstruir `categorias` E
-- `produtos`, que é exatamente o risco que esta fase não vai correr num
-- catálogo com 790 peças vivas. O que entra é uma identidade PARALELA e
-- estável (`id`), que sobrevive ao nome. Com ela, renomear vira um ato
-- atômico de quatro passos dentro de um `db.batch` (que no D1 é transação):
-- arquiva a linha antiga, insere a nova com o MESMO id, move os produtos,
-- apaga a antiga.
ALTER TABLE categorias ADD COLUMN id           TEXT;
ALTER TABLE categorias ADD COLUMN slug         TEXT;
-- A forma canônica do nome, para "Colar", "colar" e "Colar " serem a mesma
-- categoria. Não normaliza plural: "Colares" continua sendo outra coisa, e
-- decidir isso por regra seria adivinhar o catálogo da Sthefany.
ALTER TABLE categorias ADD COLUMN nome_norm    TEXT;
-- 1 = esta linha NÃO é uma categoria de verdade, é o estado "sem categoria".
-- Existe porque `produtos.cat` é NOT NULL e torná-la anulável exigiria
-- reconstruir `produtos`. Antes disto, o código usava 'Outros' como código
-- para ausência — e uma peça legitimamente "Outros" ficava incompleta para
-- sempre.
ALTER TABLE categorias ADD COLUMN sentinela    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categorias ADD COLUMN arquivada_em TEXT;
-- Para onde as peças foram quando duas categorias viraram uma. A coluna
-- existe para a mesclagem ser possível depois; NENHUM código a escreve
-- nesta fase — mesclar categoria é decisão comercial, não operação técnica.
ALTER TABLE categorias ADD COLUMN sucessora_id TEXT;
ALTER TABLE categorias ADD COLUMN criada_em    TEXT;

-- Backfill: só preenche o que está vazio. As nove categorias semeadas ganham
-- um id derivado do próprio nome, o que mantém o id legível e estável sem
-- precisar de UUID para dado que já existe.
UPDATE categorias
   SET nome_norm = LOWER(TRIM(nome)),
       slug      = COALESCE(slug, LOWER(TRIM(nome))),
       id        = COALESCE(id, LOWER(TRIM(nome))),
       criada_em = COALESCE(criada_em, datetime('now'))
 WHERE id IS NULL OR nome_norm IS NULL;

-- A sentinela. `ordem` alta para ficar no fim de qualquer lista, e sem cor
-- porque ela não é uma categoria que alguém escolhe: é o que sobra quando
-- ninguém escolheu.
INSERT OR IGNORE INTO categorias (nome, ordem, cor, id, slug, nome_norm, sentinela, criada_em)
VALUES ('Sem categoria', 99, NULL, 'sem-categoria', 'sem-categoria', 'sem categoria', 1, datetime('now'));

-- Os dois índices que fazem o BANCO garantir o que o código promete.
-- Parciais (`WHERE arquivada_em IS NULL`) por dois motivos que são um só: a
-- linha arquivada precisa sair do caminho durante o rename, e um nome
-- aposentado não pode impedir que alguém reuse aquele nome depois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_id_viva
  ON categorias(id) WHERE arquivada_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_nome_viva
  ON categorias(nome_norm) WHERE arquivada_em IS NULL;

-- ═══════════════════════════════ 2. PRODUTOS: origem ≠ autoridade, e o id
--
-- Duas perguntas que o modelo antigo não separava:
--
--   origem_cadastro  de onde este cadastro VEIO?  — fato histórico, imutável
--   autoridade       quem manda nele HOJE?        — decisão, pode migrar
--
-- Sem a separação, "o produto veio da loja" acabava sendo lido como "a loja
-- manda nele", que é justamente o que a Fase 4.5 deixa de ser verdade.
-- NULL nos dois significa "não sabemos" e é o estado correto para as 790
-- peças que já existem: reescrevê-las seria inventar procedência.
ALTER TABLE produtos ADD COLUMN origem_cadastro TEXT;   -- loja | planilha | marquesa | NULL
ALTER TABLE produtos ADD COLUMN autoridade      TEXT;   -- marquesa | loja | NULL

-- O id do produto na Nuvemshop. Hoje ele existe só por caminho indireto
-- (`loja_variantes.produto_id`, `loja_fotos.produto_id`), e uma peça sem
-- variante espelhada simplesmente não tem como ser endereçada lá.
ALTER TABLE produtos ADD COLUMN produto_id_loja TEXT;
CREATE INDEX IF NOT EXISTS idx_produtos_produto_loja ON produtos(produto_id_loja);

-- ══════════════════════════════════════════ 3. A GALERIA PRÓPRIA DA PEÇA
--
-- Antes: DUAS imagens por peça, em colunas de `produtos` — uma original e
-- uma tratada, ambas com chave determinística no R2. Trocar a foto
-- SOBRESCREVIA o objeto. Três coisas eram impossíveis: ter mais de uma
-- foto, dizer qual é a principal, e manter o original depois de preparar.
--
-- Agora a foto é LINHA, e cada linha carrega as suas versões. O original
-- nunca é sobrescrito: a chave passa a incluir o id da foto, então "trocar"
-- é criar outra linha, e a anterior continua existindo até alguém mandar
-- apagá-la.
--
-- As colunas `produtos.foto_*` NÃO são removidas e continuam válidas — elas
-- são o que o painel legado lê hoje, e derrubá-las exigiria reconstruir
-- `produtos`.
CREATE TABLE IF NOT EXISTS produto_fotos (
  id            TEXT PRIMARY KEY,                       -- uuid; entra na chave do R2
  sku           TEXT NOT NULL REFERENCES produtos(sku),
  -- A ordem da galeria é DADO, não a ordem em que as linhas foram inseridas.
  -- Quem exibe não deveria precisar saber como a lista foi lida.
  ordem         INTEGER NOT NULL DEFAULT 0,
  principal     INTEGER NOT NULL DEFAULT 0,
  -- upload | lote | nuvemshop | adocao — de onde esta imagem entrou aqui.
  origem        TEXT NOT NULL DEFAULT 'upload',
  -- O nome do arquivo como veio, preservado para a auditoria do lote poder
  -- responder "de qual arquivo saiu esta foto?" sem adivinhação.
  arquivo_nome  TEXT,
  lote_id       TEXT,
  -- Impressão digital dos bytes, para o mesmo arquivo não entrar duas vezes.
  conteudo_hash TEXT,
  -- ORIGINAL — o que a Sthefany fotografou. Nunca sobrescrito.
  original_key  TEXT,
  original_tipo TEXT,
  original_tam  INTEGER,
  original_em   TEXT,
  -- PREPARADA — fundo branco, corte, o que o preparo produzir. Escrever esta
  -- versão não encosta na de cima: é o ponto do desenho que garante que
  -- preparar nunca perde o original.
  preparada_key  TEXT,
  preparada_tipo TEXT,
  preparada_tam  INTEGER,
  preparada_em   TEXT,
  -- APROVADA — a humana olhou e disse que serve.
  aprovada_em   TEXT,
  aprovada_por  TEXT,
  -- PUBLICADA — chegou à vitrine, e sabemos com que id lá.
  publicada_em    TEXT,
  imagem_id_loja  TEXT,
  -- Quando a imagem é da loja e os bytes ainda não são nossos. É referência,
  -- não posse — o mesmo papel de `produtos.foto_url`, agora por foto.
  url_externa   TEXT,
  -- original | preparada | aprovada | publicada. É o estado DA IMAGEM, e não
  -- se confunde com o estado da publicação da peça.
  estado        TEXT NOT NULL DEFAULT 'original'
    CHECK (estado IN ('original','preparada','aprovada','publicada')),
  erro          TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produto_fotos_sku ON produto_fotos(sku, ordem);
-- UMA principal por peça, garantida pelo banco e não pela disciplina de
-- quem escreve. Índice parcial: as linhas com principal = 0 convivem à
-- vontade, e duas principais no mesmo SKU passam a ser impossíveis.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_fotos_principal
  ON produto_fotos(sku) WHERE principal = 1;
-- O mesmo arquivo não entra duas vezes no mesmo código.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_fotos_conteudo
  ON produto_fotos(sku, conteudo_hash) WHERE conteudo_hash IS NOT NULL;

-- ═════════════════════════════════════════════ 4. LOTE DE FOTOS
--
-- Muitas fotos de uma vez, casadas pelo NOME DO ARQUIVO. O lote existe como
-- tabela — e não como resposta de uma chamada — por uma razão só: ele
-- ANALISA antes de confirmar. A pessoa vê o casamento, e só então autoriza.
--
-- E um arquivo ruim nunca derruba o lote inteiro: ele vira linha com o
-- motivo, e os outros seguem.
CREATE TABLE IF NOT EXISTS fotos_lotes (
  id          TEXT PRIMARY KEY,
  estado      TEXT NOT NULL DEFAULT 'analisado'
    CHECK (estado IN ('analisado','confirmado','cancelado')),
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  criado_por  TEXT,
  confirmado_em TEXT,
  arquivos    INTEGER NOT NULL DEFAULT 0,
  vinculados  INTEGER NOT NULL DEFAULT 0,
  pendentes   INTEGER NOT NULL DEFAULT 0,
  erros       INTEGER NOT NULL DEFAULT 0,
  resumo_json TEXT
);

CREATE TABLE IF NOT EXISTS fotos_lote_itens (
  lote_id      TEXT NOT NULL REFERENCES fotos_lotes(id),
  arquivo      TEXT NOT NULL,
  -- O que o nome do arquivo sugeriu, e o que o catálogo confirmou. Os dois
  -- ficam: quando não casa, saber o que foi tentado é metade do diagnóstico.
  sku_extraido TEXT,
  sku_casado   TEXT,
  -- vinculado | multiplas | sku_nao_encontrado | nome_ambiguo |
  -- nome_invalido | duplicado | erro_upload
  situacao     TEXT NOT NULL,
  detalhe      TEXT,
  foto_id      TEXT,
  ordem_no_sku INTEGER,
  PRIMARY KEY (lote_id, arquivo)
);
CREATE INDEX IF NOT EXISTS idx_fotos_lote_itens_sit ON fotos_lote_itens(lote_id, situacao);

-- ═════════════════════════════════════ 5. TAREFA DE PREPARAÇÃO DE CONTEÚDO
--
-- A fronteira que o ERP não atravessa. Ele abre a tarefa e recebe o
-- resultado; QUEM prepara é problema de fora.
--
-- `executor` é rótulo livre de propósito ('humano', 'assistido',
-- 'servico:<nome>'). Nenhuma coluna, nenhum CHECK e nenhuma consulta deste
-- banco menciona fornecedor nenhum — hoje o executor é humano-assistido e
-- amanhã pode ser uma API, sem que o domínio do catálogo precise mudar.
CREATE TABLE IF NOT EXISTS preparacao_tarefas (
  id            TEXT PRIMARY KEY,
  sku           TEXT NOT NULL REFERENCES produtos(sku),
  estado        TEXT NOT NULL DEFAULT 'pendente'
    CHECK (estado IN ('pendente','entregue','concluida','falhou','cancelada')),
  -- Quais campos foram pedidos: nome_site, descricao_site, seo_titulo,
  -- seo_descricao. Lista, não colunas, porque o que se pede vai mudar.
  campos_json   TEXT NOT NULL DEFAULT '[]',
  -- O retrato da peça no momento em que a tarefa foi aberta. Serve para o
  -- executor trabalhar sem precisar de outra leitura e para a revisão
  -- humana ver o que ele viu.
  contexto_json TEXT,
  resultado_json TEXT,
  executor      TEXT,
  entregue_em   TEXT,
  concluida_em  TEXT,
  erro          TEXT,
  tentativas    INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_preparacao_estado ON preparacao_tarefas(estado, criado_em);
-- Uma tarefa ABERTA por peça. Fechadas convivem — o histórico é o que
-- explica por que o texto é o que é.
CREATE UNIQUE INDEX IF NOT EXISTS idx_preparacao_aberta
  ON preparacao_tarefas(sku) WHERE estado IN ('pendente','entregue');

