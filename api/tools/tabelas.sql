-- Que tabelas existem de fato neste banco.
--
-- Roda ANTES da contagem, de propósito: o schema do repositório tem 20
-- tabelas, mas um banco pode estar sem as últimas migrations. Contar uma
-- tabela que não existe derruba a consulta inteira e o erro ("no such
-- table") não diz qual das vinte faltou.
SELECT name
  FROM sqlite_master
 WHERE type = 'table'
   AND name NOT LIKE 'sqlite_%'
   AND name NOT LIKE '_cf_%'
 ORDER BY name;
