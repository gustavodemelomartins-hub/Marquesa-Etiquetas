-- ===================================================================
-- Reset controlado do DEV (marquesa-db-dev) — deixa o banco pronto para a
-- planilha real entrar PELA TELA, sem tocar em revendedoras.
--
-- ALVO: marquesa-db-dev  ·  dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b
-- NUNCA: marquesa-db     ·  089153a9-cee5-4887-b789-a23b1cf419f5  (PRODUÇÃO)
-- Três letras separam os dois. Releia o comando antes de dar enter.
--
-- NÃO dropa tabela, NÃO apaga schema, NÃO mexe em migration, NÃO toca em
-- Secret, NÃO apaga byte nenhum no R2. Só DELETE de linha.
--
-- Ordem: filho antes de pai. O D1 força as chaves estrangeiras em toda
-- query e não aceita PRAGMA foreign_keys — a ordem é obrigação, não
-- estética.
--
-- PRESERVADAS DE PROPÓSITO, e por isso não aparecem em DELETE nenhum:
--   revendedoras   cadastro inteiro e os ids originais
--   categorias     produtos.cat tem FK para cá; limpar faria a importação
--                  recusar toda linha da planilha
--   config         prazoDias, prataPct, faixas, inventarioDias e os dois
--                  freios do sync
-- ===================================================================

-- 1. inventários (inventario_itens.sku → produtos)
DELETE FROM inventario_itens;
DELETE FROM inventarios;

-- 2. vendas (venda_itens.sku → produtos, venda_itens.venda_id → vendas)
DELETE FROM venda_itens;
DELETE FROM vendas;

-- 3. maletas — o VÍNCULO OPERACIONAL da revendedora com peças que vão
--    sumir. maleta_itens.sku → produtos obriga a limpar; maletas.rev_id →
--    revendedoras é justamente o motivo de apagar a maleta e NÃO a
--    revendedora: some o vínculo, fica o cadastro.
DELETE FROM maleta_itens;
DELETE FROM maletas;

-- 4. estruturas derivadas do catálogo (FK → produtos)
DELETE FROM kit_componentes;
DELETE FROM produto_variacoes;

-- 5. A razão do estoque. Vem ANTES de reconciliacao_itens: desde a
--    migration de idempotência, movimentos.reconciliacao_item_id tem FK
--    para lá, e apagar o item antes do movimento seria recusado.
DELETE FROM movimentos;

-- 6. sessões do motor de reconciliação (itens antes das sessões)
DELETE FROM reconciliacao_itens;
DELETE FROM reconciliacao_sessoes;

-- 7. o catálogo. É o que a planilha da Sthefany vai recriar.
--    ⚠️ Apagar a linha apaga também foto_original_key / foto_tratada_key —
--    a referência, não os bytes. O objeto continua no bucket
--    marquesa-fotos-dev; nada aqui alcança o R2. Guarde o
--    tools/fotos-manifesto.sql ANTES de rodar isto.
DELETE FROM produtos;

-- 8. filas que só falam de produtos que deixaram de existir
DELETE FROM produtos_pendentes;
DELETE FROM fotos_orfas;

-- 9. caches e histórico derivados da loja — sem catálogo, descrevem o vazio
DELETE FROM loja_snapshot;
DELETE FROM sync_execucoes;

-- 10. clientes de balcão. Sem FK para produto: some junto porque em DEV são
--     os nomes inventados pelos testes. Se houver cliente real, comente.
DELETE FROM clientes;

-- 11. Estado do robô guardado em config. São três chaves, e só elas:
--     syncUltimoPedido  — até que pedido da loja já li
--     syncUltimoEstoque — quando o último empurrão foi aplicado
--     lojaVariacoes     — códigos que a rodada decidiu não empurrar
--     Todas descrevem um estoque que não existe mais. Apagar faz a próxima
--     rodada recomeçar a leitura; NÃO desconecta a loja, NÃO mexe em token
--     e NÃO libera escrita. Os freios (syncLimiteMudancas, syncLimiteZerar)
--     e os parâmetros de negócio ficam.
DELETE FROM config WHERE chave IN ('syncUltimoPedido', 'syncUltimoEstoque', 'lojaVariacoes');
