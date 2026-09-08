-- Rollback do Pacote 4.
-- A remoção perde apenas rascunhos e decisões de publicação; catálogo,
-- fotos e estoque permanecem intactos. Faça backup antes de executar.

DROP INDEX IF EXISTS idx_catalogo_publicacoes_estado;
DROP TABLE IF EXISTS catalogo_publicacoes;
