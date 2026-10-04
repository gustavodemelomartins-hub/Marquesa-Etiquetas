-- Desfaz migracao-cliente-avatar.sql. Só apaga as três tabelas do avatar;
-- clientes e todo o resto ficam intactos. Os objetos `clientes/<id>/avatar`
-- do R2 (se houver) ficam órfãos e inofensivos — apague-os à parte, se quiser.
DROP TABLE IF EXISTS cliente_avatar_busca;
DROP TABLE IF EXISTS cliente_avatar_candidato;
DROP TABLE IF EXISTS cliente_avatar;
