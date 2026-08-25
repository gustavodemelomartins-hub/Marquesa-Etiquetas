-- Liga a venda local ao pedido criado na Nuvemshop e guarda qual variante
-- física saiu. A mudança é só de expansão: código antigo ignora as colunas;
-- rollback é republicar o Worker antigo e deixar os dados preservados.
--
-- ALTER TABLE ADD COLUMN não é idempotente no SQLite. "duplicate column
-- name" significa que esta migration já foi aplicada; não execute o restante
-- uma segunda vez às cegas.

ALTER TABLE vendas ADD COLUMN nuvemshop_status TEXT NOT NULL DEFAULT 'nao_enviada';
ALTER TABLE vendas ADD COLUMN nuvemshop_erro TEXT;
ALTER TABLE vendas ADD COLUMN nuvemshop_em TEXT;

ALTER TABLE venda_itens ADD COLUMN variacao TEXT;
ALTER TABLE venda_itens ADD COLUMN variante_id TEXT;

CREATE INDEX IF NOT EXISTS idx_venda_itens_variante ON venda_itens(variante_id);
