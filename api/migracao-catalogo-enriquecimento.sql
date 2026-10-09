-- 2026-10-09: journal editorial aditivo, sem alteração de ledger ou estoque.
-- Reexecutável; preserva integralmente registros anteriores.
CREATE TABLE IF NOT EXISTS nuvemshop_enriquecimento (
  id TEXT PRIMARY KEY,
  sku TEXT,
  product_id TEXT NOT NULL,
  regra TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('preparado','validado','erro')),
  before_json TEXT NOT NULL,
  patch_json TEXT NOT NULL,
  after_json TEXT,
  before_hash TEXT NOT NULL,
  after_hash TEXT,
  fonte_hash TEXT,
  erro TEXT,
  em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_enriquecimento_produto
  ON nuvemshop_enriquecimento(product_id, regra, em);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_enriquecimento_estado
  ON nuvemshop_enriquecimento(estado, em);
