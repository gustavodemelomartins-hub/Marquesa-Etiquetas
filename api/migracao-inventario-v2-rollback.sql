-- Rollback de api/migracao-inventario-v2.sql.
--
-- Só estrutura: nenhuma linha de `movimentos` nasce desta migration, então
-- desfazê-la não mexe em saldo. As leituras gravadas depois dela se perdem
-- (a contagem em `inventario_contagem` continua — ela é a soma das
-- leituras). Rode SÓ depois de voltar o Worker para a versão anterior: o
-- código novo lê estas colunas.

DROP INDEX IF EXISTS idx_inv_leituras;
DROP TABLE IF EXISTS inventario_leituras;
DROP INDEX IF EXISTS idx_inventarios_numero;
ALTER TABLE inventarios DROP COLUMN numero;
ALTER TABLE inventario_resultado DROP COLUMN partes_json;
ALTER TABLE inventarios_excluidos DROP COLUMN numero;
