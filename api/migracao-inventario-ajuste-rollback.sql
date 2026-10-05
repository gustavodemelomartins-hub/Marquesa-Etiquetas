-- Desfaz api/migracao-inventario-ajuste.sql.
--
-- ATENÇÃO: só rode se nenhum ajuste de inventário foi aplicado e nenhum
-- inventário foi excluído depois da migration — as duas tabelas são o
-- registro desses atos. Com linhas nelas, prefira voltar o Worker e
-- manter as tabelas (o Worker antigo não as lê, e elas não atrapalham).
DROP TABLE IF EXISTS inventarios_excluidos;
DROP TABLE IF EXISTS inventario_ajustes;
