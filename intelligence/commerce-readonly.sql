-- Read-only export contract. Run only after confirming remote schema/bindings.
-- Statements are separate result sets: products, categories, maletas, maleta_itens,
-- kit_componentes, loja_variantes, vendas, venda_itens. Save as tables of those names.
-- No names, clients, reseller IDs, addresses, observations, tokens or R2 bytes.
-- No migrations/writes. Do not assume the local schema matches remote production.
SELECT sku, "desc", cat, preco, custo, qtd, status, url_loja, produto_id_loja,
       estoque_loja, visivel, atualizado_em FROM produtos;
SELECT id, nome, sentinela FROM categorias;
SELECT id, status FROM maletas;
SELECT maleta_id, sku, qtd, devolvida FROM maleta_itens;
SELECT kit_sku, componente_sku, qtd FROM kit_componentes;
SELECT variante_id, produto_id, sku, sku_norm, produto_url, preco,
       promocional, estoque, produto_visivel, lido_em FROM loja_variantes;
SELECT v.id, v.origem, v.data, v.total, v.cancelada, v.externo_id,
       v.pago, v.data_pagamento, v.pagamento_origem, v.valor_recebido,
       v.cobravel FROM vendas v
 WHERE v.origem = 'site' AND v.cancelada = 0 AND v.revendedora_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM historico_operacao_vendas hov
                    WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa');
SELECT i.id, i.venda_id, i.sku, i.qtd, i.preco, i.motivo, i.variante_id
  FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
 WHERE v.origem = 'site' AND v.cancelada = 0 AND v.revendedora_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM historico_operacao_vendas hov
                    WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa');
