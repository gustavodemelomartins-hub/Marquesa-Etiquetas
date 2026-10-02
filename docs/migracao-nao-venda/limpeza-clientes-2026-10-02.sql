-- limpeza-clientes-2026-10-02
-- gerado de antes.sqlite -> depois.sqlite
--   clientes: +0 ~3 -1
--   saidas_sem_faturamento: +1 ~0 -0
--   historico_reclassificacao: +1 ~0 -0
PRAGMA defer_foreign_keys = true;
INSERT INTO config (chave, valor) VALUES ('limpeza-clientes-2026-10-02', '"2026-10-02T13:12:53.281Z"');
-- PRECONDIÇÃO sem tabela auxiliar: se PROD mudou desde o export, o valor vira
-- NULL, o NOT NULL de config.valor falha e o arquivo inteiro volta (o D1
-- aplica --file de forma atômica). Nenhuma remoção estrutural.
INSERT INTO config (chave, valor) VALUES ('limpeza-clientes-2026-10-02:precondicao',
  CASE WHEN (SELECT COUNT(*) FROM "clientes") = 353
  AND (SELECT COUNT(*) FROM "saidas_sem_faturamento") = 12
  AND (SELECT COUNT(*) FROM "historico_reclassificacao") = 30
  AND (SELECT COALESCE(SUM(qtd),0) FROM produtos) = 2244
  AND (SELECT COALESCE(MAX(id),0) FROM movimentos) = 3889
  AND (SELECT COALESCE(MAX(id),0) FROM vendas) = 22 THEN '"ok"' ELSE NULL END);
UPDATE "clientes" SET "atualizada_em" = '2026-10-02 13:12:08', "arquivada_em" = '2026-10-02 13:12:08', "arquivada_motivo" = 'cadastro operacional da planilha antiga (brinde) — não é cliente; as linhas estão em Saídas sem faturamento' WHERE "id" = 300;
UPDATE "clientes" SET "atualizada_em" = '2026-10-02 13:12:08', "arquivada_em" = '2026-10-02 13:12:08', "arquivada_motivo" = 'cadastro operacional da planilha antiga (brinde) — não é cliente; as linhas estão em Saídas sem faturamento' WHERE "id" = 311;
UPDATE "clientes" SET "atualizada_em" = '2026-10-02 13:12:08', "arquivada_em" = '2026-10-02 13:12:08', "arquivada_motivo" = 'cadastro operacional da planilha antiga (diferença de inventário) — não é cliente; as linhas estão em Saídas sem faturamento' WHERE "id" = 326;
INSERT INTO "saidas_sem_faturamento" ("id", "tipo", "sentido", "data", "sku", "variacao", "variante_id", "qtd", "motivo", "observacao", "movimento_id", "estoque_refletido", "origem_usuario", "estornada", "estorno_em", "estorno_motivo", "estorno_movimento_id", "origem_registro", "historico_item_id", "inventario_id", "criado_em", "atualizado_em", "preco_unit", "preco_fonte", "custo_unit", "custo_fonte") VALUES (13, 'brinde', 'saida', '2026-05-08', '129561', NULL, NULL, 1, 'Eu que dei · Maleta (Feira Franceschini)', 'Planilha de vendas, Nº 1068 — "cliente" Brinde dia das mães. "Brinde dia das mães" é a ocasião do brinde, não uma cliente ("Eu que dei"). Decisão do dono em 02/10/2026: brinde é saída sem faturamento, mesmo com valor marcado PAGO na planilha.', NULL, 0, NULL, 0, NULL, NULL, NULL, 'migracao_historico', 3785, NULL, '2026-10-02 13:12:08', NULL, 109, 'planilha', NULL, NULL);
INSERT INTO "historico_reclassificacao" ("id", "historico_item_id", "classe_nova", "confianca", "motivo", "saida_id", "status", "decidido_em", "decidido_por", "criado_em") VALUES (31, 3785, 'brinde', 'alta', '"Brinde dia das mães" é a ocasião do brinde, não uma cliente ("Eu que dei"). Decisão do dono em 02/10/2026: brinde é saída sem faturamento, mesmo com valor marcado PAGO na planilha.', 13, 'aplicada', '2026-10-02 13:12:08', 'limpeza-clientes-2026-10-02', '2026-10-02 13:12:08');
DELETE FROM "clientes" WHERE "id" = 219;
