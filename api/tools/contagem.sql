-- Contagem de registros por tabela, na ordem em que o plano de reset as trata.
-- Só leitura. Seguro rodar no DEV a qualquer momento.
--
-- Uma linha só, com uma subconsulta por tabela, de propósito: o D1 recusa
-- um SELECT composto com este tanto de UNION ALL ("too many terms in
-- compound SELECT"), e a forma abaixo passa nos dois — D1 e SQLite local.
SELECT
  (SELECT COUNT(*) FROM categorias)        AS categorias,
  (SELECT COUNT(*) FROM revendedoras)      AS revendedoras,
  (SELECT COUNT(*) FROM config)            AS config,
  (SELECT COUNT(*) FROM produtos)          AS produtos,
  (SELECT COUNT(*) FROM movimentos)        AS movimentos,
  (SELECT COUNT(*) FROM produto_variacoes) AS produto_variacoes,
  (SELECT COUNT(*) FROM kit_componentes)   AS kit_componentes,
  (SELECT COUNT(*) FROM maletas)           AS maletas,
  (SELECT COUNT(*) FROM maleta_itens)      AS maleta_itens,
  (SELECT COUNT(*) FROM vendas)            AS vendas,
  (SELECT COUNT(*) FROM venda_itens)       AS venda_itens,
  (SELECT COUNT(*) FROM clientes)          AS clientes,
  (SELECT COUNT(*) FROM inventarios)       AS inventarios,
  (SELECT COUNT(*) FROM inventario_itens)  AS inventario_itens,
  (SELECT COUNT(*) FROM sync_execucoes)    AS sync_execucoes,
  (SELECT COUNT(*) FROM loja_snapshot)     AS loja_snapshot;
