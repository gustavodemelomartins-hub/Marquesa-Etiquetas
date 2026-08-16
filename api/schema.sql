-- Marquesa · banco central (Cloudflare D1 / SQLite)
--
-- Estrutura seguindo o documento de contexto da operação:
--   §19  o saldo resulta das movimentações, não de digitação
--   §6.1 a maleta congela o preço do momento do envio
--   §9   peça não devolvida no acerto gera venda de verdade
--   §24  produto sem preço fica "sem preço", não vira R$ 0
--   §28  não apagar histórico — arquivar e cancelar, nunca excluir
--   §4   categorias configuráveis

-- Nota: o D1 já força as chaves estrangeiras em toda query, e não aceita
-- `PRAGMA foreign_keys` — por isso ele não aparece aqui.

-- ---------------------------------------------------------------- categorias
-- §4: configuráveis. A derivação pela descrição continua sendo o palpite
-- inicial na importação, mas o valor final é editável e mora aqui.
CREATE TABLE IF NOT EXISTS categorias (
  nome   TEXT PRIMARY KEY,
  ordem  INTEGER NOT NULL DEFAULT 0,
  cor    TEXT
);

INSERT OR IGNORE INTO categorias (nome, ordem, cor) VALUES
  ('Colar',     1, '#C2426B'),
  ('Brinco',    2, '#C4802A'),
  ('Pulseira',  3, '#0D9382'),
  ('Berloque',  4, '#6A54B5'),
  ('Anel',      5, '#D8646B'),
  ('Argola',    6, '#3D77C4'),
  ('Pingente',  7, '#5C8A34'),
  ('Conjunto',  8, '#A15BA0'),
  ('Outros',    9, '#9E8A90');

-- ----------------------------------------------------------------- produtos
-- qtd é saldo MATERIALIZADO do estoque total. A verdade é a tabela
-- movimentos; qtd existe para leitura rápida e é conferível a qualquer
-- momento por /api/estoque/conferir (§19 e §31, que admitem os dois juntos).
CREATE TABLE IF NOT EXISTS produtos (
  sku            TEXT PRIMARY KEY,
  desc           TEXT NOT NULL,
  cat            TEXT NOT NULL REFERENCES categorias(nome),
  preco          REAL,                          -- §24: NULL = sem preço. Nunca 0 por omissão.
  qtd            INTEGER NOT NULL DEFAULT 0,    -- estoque TOTAL (inclui o consignado)
  status         TEXT NOT NULL DEFAULT 'ativo', -- ativo | inativo
  url_loja       TEXT,
  estoque_loja   INTEGER,
  visivel        INTEGER,
  nome_loja      TEXT,
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------- movimentos
-- §18/§19: responde "por que o estoque deste SKU mudou?".
-- qtd é o efeito ASSINADO sobre o estoque total:
--   entrada/devolução de fornecedor  → positivo
--   venda/perda/quebra/brinde/troca  → negativo
--   consignação e devolução de maleta → 0 (não mudam o total, só onde a peça está)
-- Por isso vale sempre:  produtos.qtd == SUM(movimentos.qtd)
CREATE TABLE IF NOT EXISTS movimentos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sku            TEXT NOT NULL REFERENCES produtos(sku),
  tipo           TEXT NOT NULL,   -- entrada|ajuste|consignacao|devolucao|venda|perda|quebra|dano|furto|brinde|troca|nota_credito|venda_conjunto|cancelamento
  qtd            INTEGER NOT NULL,
  origem         TEXT,            -- importacao | manual | maleta | acerto | venda | inventario | cancelamento
  maleta_id      INTEGER,
  revendedora_id INTEGER,
  venda_id       INTEGER,
  obs            TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------- revendedoras
-- §28: nunca excluída. Sai de circulação virando status='inativa'.
CREATE TABLE IF NOT EXISTS revendedoras (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  tel        TEXT,
  cidade     TEXT,
  cpf        TEXT,
  endereco   TEXT,
  obs        TEXT,
  status     TEXT NOT NULL DEFAULT 'ativa',   -- ativa | inativa
  criada_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- maletas
-- §6.1: status Aberta | Em acerto | Encerrada | Cancelada.
-- "em_acerto" é estado de verdade no banco, e não só uma tela aberta —
-- assim dá para começar a conferência no celular e terminar no computador.
CREATE TABLE IF NOT EXISTS maletas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rev_id       INTEGER NOT NULL REFERENCES revendedoras(id),
  status       TEXT NOT NULL DEFAULT 'aberta',  -- aberta | em_acerto | encerrada | cancelada
  aberta_em    TEXT,
  acerto_em    TEXT,                             -- data combinada do acerto
  encerrada_em TEXT,
  obs          TEXT,
  acerto_json  TEXT
);

-- §6.1: preço de referência no momento do envio. Sem isso, reajustar o
-- preço de uma peça mudaria o valor de toda maleta que já saiu.
CREATE TABLE IF NOT EXISTS maleta_itens (
  maleta_id    INTEGER NOT NULL REFERENCES maletas(id),
  sku          TEXT NOT NULL REFERENCES produtos(sku),
  qtd          INTEGER NOT NULL,
  preco_envio  REAL,                 -- congelado; NULL só se a peça não tinha preço
  devolvida    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (maleta_id, sku)
);

-- ----------------------------------------------------------------- config
CREATE TABLE IF NOT EXISTS config (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loja_snapshot (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  lido_em            TEXT,
  produtos_na_loja   INTEGER,
  produtos_casados   INTEGER,
  so_na_loja         INTEGER,
  codigos_casados    INTEGER,
  duplicados_json    TEXT
);

-- ---------------------------------------------------------------- clientes
CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  tel        TEXT,
  criada_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------ vendas
-- §9: venda de balcão e venda vinda do acerto moram na MESMA tabela,
-- diferenciadas por origem. É o que permite pedir "as vendas do dia" e
-- receber tudo, não metade.
CREATE TABLE IF NOT EXISTS vendas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id     INTEGER REFERENCES clientes(id),
  cliente_nome   TEXT,                              -- vazio quando a origem é acerto
  revendedora_id INTEGER REFERENCES revendedoras(id),
  maleta_id      INTEGER REFERENCES maletas(id),
  origem         TEXT NOT NULL DEFAULT 'balcao',    -- balcao | acerto | site
  data           TEXT NOT NULL,
  total          REAL NOT NULL,
  cancelada      INTEGER NOT NULL DEFAULT 0,        -- §28: cancela, não apaga
  -- Identidade do pedido lá fora ("nuvemshop:1234"). O índice único abaixo
  -- é o que impede uma rodada repetida da sincronização de cobrar a mesma
  -- venda duas vezes — a trava é do banco, não da lógica que pode falhar.
  externo_id     TEXT,
  criada_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cada rodada da sincronização com a loja, para poder responder "o que o
-- robô fez de madrugada?" sem depender de log de servidor.
CREATE TABLE IF NOT EXISTS sync_execucoes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  iniciado_em       TEXT,
  terminado_em      TEXT,
  status            TEXT,          -- rodando | ok | pausado | erro
  pedidos_lidos     INTEGER,
  vendas_criadas    INTEGER,
  produtos_enviados INTEGER,
  detalhe_json      TEXT
);

CREATE TABLE IF NOT EXISTS venda_itens (
  venda_id  INTEGER NOT NULL REFERENCES vendas(id),
  sku       TEXT NOT NULL REFERENCES produtos(sku),
  desc      TEXT NOT NULL,
  qtd       INTEGER NOT NULL,
  preco     REAL NOT NULL,
  motivo    TEXT                                    -- §8: venda|perda|quebra|brinde|troca|...
);

-- ------------------------------------------------------------- inventário
-- A conferência física do que está em casa. Fica aberta enquanto ela bipa:
-- é estado de verdade no banco, e não só uma tela aberta, para poder começar
-- no celular no meio da sala e terminar no computador — mesma escolha já
-- feita para a maleta "em_acerto".
--
-- Códigos bipados que não existem no catálogo não entram em inventario_itens
-- (a chave estrangeira os recusaria, e com razão: a razão de estoque não pode
-- citar peça que não existe). Ficam em desconhecidos_json para a tela poder
-- mostrá-los — §22, sinalizar em vez de engolir.
CREATE TABLE IF NOT EXISTS inventarios (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  status             TEXT NOT NULL DEFAULT 'aberto',   -- aberto | concluido | cancelado
  iniciado_em        TEXT NOT NULL DEFAULT (datetime('now')),
  concluido_em       TEXT,
  desconhecidos_json TEXT,
  obs                TEXT
);

-- `esperado` é congelado no fechamento, do mesmo jeito que maleta_itens
-- congela o preço do envio (§6.1). Sem isso, abrir um inventário de três
-- meses atrás mostraria a diferença contra o estoque de HOJE — e um
-- inventário que muda de resultado depois de fechado não serve para nada.
CREATE TABLE IF NOT EXISTS inventario_itens (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT NOT NULL REFERENCES produtos(sku),
  contado       INTEGER NOT NULL DEFAULT 0,
  esperado      INTEGER,                            -- NULL enquanto aberto
  ajustado      INTEGER NOT NULL DEFAULT 0,         -- 1 = já virou movimento
  PRIMARY KEY (inventario_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_mov_sku        ON movimentos(sku);
CREATE INDEX IF NOT EXISTS idx_mov_maleta     ON movimentos(maleta_id);
CREATE INDEX IF NOT EXISTS idx_mov_criado     ON movimentos(criado_em);
CREATE INDEX IF NOT EXISTS idx_maleta_itens   ON maleta_itens(maleta_id);
CREATE INDEX IF NOT EXISTS idx_maletas_rev    ON maletas(rev_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data    ON vendas(data);
CREATE INDEX IF NOT EXISTS idx_vendas_origem  ON vendas(origem);
CREATE INDEX IF NOT EXISTS idx_venda_itens_v  ON venda_itens(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_s  ON venda_itens(sku);
CREATE INDEX IF NOT EXISTS idx_inv_status     ON inventarios(status);
CREATE INDEX IF NOT EXISTS idx_inv_itens      ON inventario_itens(inventario_id);
-- Sem cláusula WHERE de propósito: no SQLite vários NULL convivem num índice
-- único (NULL nunca é igual a NULL), então um índice simples já deixa passar
-- todas as vendas normais e recusa só o mesmo pedido do site duas vezes.
-- Índice parcial faria o mesmo com mais sintaxe para dar errado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_externo ON vendas(externo_id);
