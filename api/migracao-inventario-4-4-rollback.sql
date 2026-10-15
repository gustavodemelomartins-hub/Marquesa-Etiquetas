-- Rollback de api/migracao-inventario-4-4.sql
--
-- Descarta o que a migration criou. NÃO derruba as duas colunas aditivas:
-- coluna com default NULL não muda leitura nenhuma, e removê-la em SQLite
-- exigiria reconstruir `saidas_sem_faturamento` e `inventarios` — a operação
-- que a migration existe justamente para evitar.
--
-- Depois deste rollback o inventário volta ao comportamento anterior lendo
-- `inventario_itens`, que continua intacta.
--
-- Antes de rodar em qualquer banco com dado real: as linhas de
-- `saidas_sem_faturamento` com `inventario_id` preenchido CONTINUAM válidas —
-- elas são saídas reais, com movimento real, e o estoque delas está certo. O
-- que se perde é o índice que impedia a segunda aplicação da mesma diferença.
DROP INDEX IF EXISTS idx_saida_inventario_unica;
DROP INDEX IF EXISTS idx_inv_resultado;
DROP INDEX IF EXISTS idx_inv_contagem;
DROP TABLE IF EXISTS inventario_resultado;
DROP TABLE IF EXISTS inventario_nao_identificado;
DROP TABLE IF EXISTS inventario_contagem;
