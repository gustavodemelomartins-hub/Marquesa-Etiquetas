-- Variações de um código: aro do anel, comprimento da corrente.
--
-- A tabela é segura de rodar duas vezes. O ALTER TABLE abaixo NÃO é: ele
-- falha se a coluna já existir, e esse erro significa "já foi aplicada" —
-- pode ignorar.

CREATE TABLE IF NOT EXISTS produto_variacoes (
  sku          TEXT NOT NULL REFERENCES produtos(sku),
  nome         TEXT NOT NULL,
  atributo     TEXT,
  variante_id  TEXT,
  produto_id   TEXT,
  estoque_loja INTEGER,
  ordem        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sku, nome)
);
CREATE INDEX IF NOT EXISTS idx_variacoes_sku ON produto_variacoes(sku);

ALTER TABLE movimentos ADD COLUMN variacao TEXT;
