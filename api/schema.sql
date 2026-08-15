-- Marquesa · banco central (Cloudflare D1 / SQLite)
--
-- Espelha o "state" que hoje vive no localStorage do dashboard, mais duas
-- tabelas novas que a tela de Venda vai precisar: clientes e vendas.
-- Nada de PII sensível é dado obrigatório — CPF e telefone continuam opcionais.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS produtos (
  sku            TEXT PRIMARY KEY,
  desc           TEXT NOT NULL,
  cat            TEXT NOT NULL,
  preco          REAL NOT NULL DEFAULT 0,
  qtd            INTEGER NOT NULL DEFAULT 0,   -- estoque TOTAL (inclui o que está com revendedoras)
  url_loja       TEXT,                          -- Identificador URL na Nuvemshop, se casado
  estoque_loja   INTEGER,                        -- último estoque publicado, lido no import
  visivel        INTEGER,                        -- 1/0/NULL = não sei
  nome_loja      TEXT,
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revendedoras (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  tel        TEXT,
  cidade     TEXT,
  cpf        TEXT,
  criada_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maletas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rev_id       INTEGER NOT NULL REFERENCES revendedoras(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'aberta',   -- 'aberta' | 'fechada'
  aberta_em    TEXT,                              -- pode ser desconhecida
  acerto_em    TEXT,                              -- prazo/compromisso combinado
  fechada_em   TEXT,
  obs          TEXT,
  acerto_json  TEXT                               -- resumo do acerto fechado, formato fixo → JSON
);

CREATE TABLE IF NOT EXISTS maleta_itens (
  maleta_id  INTEGER NOT NULL REFERENCES maletas(id) ON DELETE CASCADE,
  sku        TEXT NOT NULL REFERENCES produtos(sku),
  qtd        INTEGER NOT NULL,
  PRIMARY KEY (maleta_id, sku)
);

-- Config é chave/valor: cabe tudo (prazoDias, prataPct, faixas) sem migração de schema
-- toda vez que uma regra de comissão nova aparecer.
CREATE TABLE IF NOT EXISTS config (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL   -- JSON
);

-- Retrato do último export da Nuvemshop importado — linha única.
CREATE TABLE IF NOT EXISTS loja_snapshot (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  lido_em            TEXT,
  produtos_na_loja   INTEGER,
  produtos_casados   INTEGER,
  so_na_loja         INTEGER,
  codigos_casados    INTEGER,
  duplicados_json    TEXT
);

-- ================= Novo: tela de Venda =================

CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  tel        TEXT,
  criada_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id    INTEGER REFERENCES clientes(id),
  cliente_nome  TEXT NOT NULL,   -- retrato do nome no momento da venda (cliente pode ser editado depois)
  data          TEXT NOT NULL,   -- YYYY-MM-DD, dia da venda (pode diferir de criada_em por fuso)
  total         REAL NOT NULL,
  criada_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venda_itens (
  venda_id  INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  sku       TEXT NOT NULL REFERENCES produtos(sku),
  desc      TEXT NOT NULL,   -- retrato da descrição no momento da venda
  qtd       INTEGER NOT NULL,
  preco     REAL NOT NULL    -- preço NO MOMENTO da venda, não o do catálogo hoje
);

CREATE INDEX IF NOT EXISTS idx_maleta_itens_maleta   ON maleta_itens(maleta_id);
CREATE INDEX IF NOT EXISTS idx_maletas_rev            ON maletas(rev_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data            ON vendas(data);
CREATE INDEX IF NOT EXISTS idx_venda_itens_venda       ON venda_itens(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_sku         ON venda_itens(sku);
