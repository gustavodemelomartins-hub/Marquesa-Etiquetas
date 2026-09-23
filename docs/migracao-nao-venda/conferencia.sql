-- ════════════════════════════════════════════════════════════════════════
-- Conferência da migração "saídas sem faturamento" — SOMENTE LEITURA.
--
-- Todo statement aqui é SELECT. Rodar ANTES e DEPOIS e comparar linha a
-- linha: os blocos 1–4 têm que mudar exatamente do jeito previsto, e os
-- blocos 5–9 NÃO PODEM MUDAR NADA.
--
-- Como rodar sem escrever (um por vez, `--command`, nunca `--file`):
--   npx wrangler d1 execute DB --remote -c api/wrangler.toml --json \
--     --command "<cole um bloco aqui>"
-- ou, mais barato, contra um export local:
--   npx wrangler d1 export DB --remote -c api/wrangler.toml --output prod.sql
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. Os 4 cadastros-alvo. Esperado: exatamente estes ids, sempre.
SELECT id, nome, nome_norm FROM clientes WHERE id IN (64, 300, 311, 326);

-- ─── 2. As 37 linhas a reclassificar. ANTES: 37. DEPOIS: 37 (nada é apagado).
SELECT h.cliente_id, COUNT(*) linhas, SUM(h.qtd) pecas,
       ROUND(SUM(COALESCE(h.valor_total, 0)), 2) valor
  FROM vendas_historico_itens h
  JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
 WHERE h.cliente_id IN (64, 300, 311, 326)
 GROUP BY 1 ORDER BY 1;
-- esperado: 64→32/32/1358.0 · 300→1/1/109.0 · 311→1/1/0.0 · 326→3/3/0.0

-- ─── 3. Decisões gravadas. ANTES: 0. DEPOIS: 37 'aplicada' (0 'proposta').
SELECT status, classe_nova, COUNT(*) n
  FROM historico_reclassificacao GROUP BY 1, 2 ORDER BY 1, 2;
-- esperado depois: aplicada/brinde=2 · aplicada/perda=3 · aplicada/uso_proprio=32

-- ─── 4. Faturamento histórico com o filtro §30 já aplicado.
--        ANTES: 128780.71 · DEPOIS: 127680.71 (−1100.00)
SELECT ROUND(SUM(vh.valor_pago), 2) faturamento, COUNT(*) vendas,
       SUM(vh.pecas) pecas,
       SUM(CASE WHEN vh.elegivel_ticket = 1 THEN 1 ELSE 0 END) tickets
  FROM vendas_historicas vh
 WHERE vh.classe = 'venda'
   AND EXISTS (
     SELECT 1 FROM vendas_historico_itens hi
      WHERE hi.venda_historica_id = vh.id
        AND NOT EXISTS (
          SELECT 1 FROM historico_reclassificacao rc
           WHERE rc.historico_item_id = hi.id AND rc.status = 'aplicada'
        )
   );
-- esperado antes: 128780.71 / 711 / 1391 / 681
-- esperado depois: 127680.71 / 681 / 1357 / 664

-- ════════════════════════ INVARIANTES — NÃO PODEM MUDAR ════════════════

-- ─── 5. Razão contábil. Tem que dar 1487 = 1487 nos dois momentos.
SELECT (SELECT COALESCE(SUM(qtd), 0) FROM produtos)   soma_produtos,
       (SELECT COALESCE(SUM(qtd), 0) FROM movimentos) soma_movimentos;

-- ─── 6. Nenhum SKU divergente. Tem que voltar VAZIO nos dois momentos.
SELECT p.sku, p.qtd, COALESCE(SUM(m.qtd), 0) mv
  FROM produtos p LEFT JOIN movimentos m ON m.sku = p.sku
 GROUP BY p.sku, p.qtd HAVING p.qtd <> COALESCE(SUM(m.qtd), 0);

-- ─── 7. Contagem de movimentos. 1428 antes, 1428 depois.
--        Se subir, a migração criou baixa de estoque — o defeito que a
--        FASE 1 provou ser impossível: a importação histórica nunca
--        movimentou peça. Qualquer aumento aqui é uma segunda baixa.
SELECT COUNT(*) movimentos, COALESCE(SUM(qtd), 0) soma FROM movimentos;

-- ─── 8. As linhas da planilha continuam lá, com os mesmos SKUs e datas.
--        Hash de conteúdo dos 37 registros. Igual antes e depois.
SELECT COUNT(*) linhas,
       GROUP_CONCAT(h.id || ':' || COALESCE(h.sku, '-') || ':'
                    || COALESCE(h.data, '-') || ':' || h.qtd, '|') impressao
  FROM vendas_historico_itens h
 WHERE h.cliente_id IN (64, 300, 311, 326) ORDER BY h.id;

-- ─── 9. Nenhum OUTRO cliente foi afetado. Tem que voltar VAZIO.
SELECT rc.id, rc.historico_item_id, h.cliente_id, h.cliente_nome_original
  FROM historico_reclassificacao rc
  JOIN vendas_historico_itens h ON h.id = rc.historico_item_id
 WHERE h.cliente_id NOT IN (64, 300, 311, 326);

-- ─── 10. Os 9 "Marques" legítimos continuam faturando igual.
--         Tem que dar exatamente o mesmo número antes e depois.
SELECT vh.cliente_id, COUNT(*) vendas, ROUND(SUM(vh.valor_pago), 2) pago
  FROM vendas_historicas vh
 WHERE vh.cliente_id IN (3, 73, 96, 130, 164, 195, 250, 312, 314)
 GROUP BY 1 ORDER BY 1;

-- ─── 11. Saídas sem faturamento gravadas, se a FASE 2 também as criar.
--         Toda linha tem que ter estoque_refletido = 0 e movimento_id NULL.
SELECT tipo, COUNT(*) n, SUM(qtd) pecas,
       SUM(CASE WHEN estoque_refletido = 1 THEN 1 ELSE 0 END) refletidas,
       SUM(CASE WHEN movimento_id IS NOT NULL THEN 1 ELSE 0 END) com_movimento
  FROM saidas_sem_faturamento GROUP BY 1;
-- esperado: refletidas=0 e com_movimento=0 em TODAS as linhas.
-- Qualquer outro valor significa que a migração baixou estoque duas vezes.
