-- ===================================================================
-- Reset controlado do DEV — deixa o banco pronto para a importação de
-- estoque ser feita PELA TELA, sem tocar em revendedoras.
--
-- NÃO roda em produção. NÃO dropa tabela, NÃO apaga schema, NÃO mexe em
-- migration nem em Secret. Só DELETE de linha.
--
-- Ordem: filho antes de pai, para nenhuma FK do D1 recusar no meio.
-- (O D1 força as chaves estrangeiras em toda query e não aceita
-- PRAGMA foreign_keys — por isso a ordem é obrigatória, não estética.)
--
-- PRESERVADAS DE PROPÓSITO, e por isso não aparecem em nenhum DELETE:
--   revendedoras      cadastro inteiro: nome, tel, cidade, cpf, endereço,
--                     obs, status, criada_em, e os ids originais
--   categorias        a importação classifica contra esta lista; sem ela
--                     todo produto novo seria recusado pela FK produtos.cat
--   config            prazoDias, prataPct, faixas, syncLimiteMudancas,
--                     syncLimiteZerar — parâmetros da operação, não dado
-- ===================================================================

-- 1. inventários — filhos primeiro (inventario_itens.sku → produtos)
DELETE FROM inventario_itens;
DELETE FROM inventarios;

-- 2. vendas — venda_itens.sku → produtos, venda_itens.venda_id → vendas
DELETE FROM venda_itens;
DELETE FROM vendas;

-- 3. maletas — VÍNCULO OPERACIONAL da revendedora com peças que vão sumir.
--    maleta_itens.sku → produtos obriga a limpar. maletas.rev_id → revendedoras
--    é o motivo de apagar a maleta e NÃO a revendedora: some o vínculo,
--    fica o cadastro.
DELETE FROM maleta_itens;
DELETE FROM maletas;

-- 4. estruturas derivadas do catálogo (todas com FK → produtos)
DELETE FROM kit_componentes;
DELETE FROM produto_variacoes;

-- 5. razão do estoque e o catálogo em si (movimentos.sku → produtos)
DELETE FROM movimentos;
DELETE FROM produtos;

-- 6. caches e histórico derivados da loja — sem produto, descrevem o vazio
DELETE FROM loja_snapshot;
DELETE FROM sync_execucoes;

-- 7. clientes de balcão. Sem FK para produto: some junto porque em DEV são
--    os nomes inventados pelos testes. Se houver cliente real aqui,
--    comente esta linha antes de rodar.
DELETE FROM clientes;

-- 8. cursor da sincronização: guarda "até que pedido da loja já li".
--    Com o estoque zerado ele aponta para um passado que não existe mais.
--    Apagar faz a próxima rodada recomeçar a leitura; NÃO desconecta a
--    loja, NÃO mexe em token e NÃO libera escrita.
--    Os limites do freio (syncLimiteMudancas / syncLimiteZerar) ficam.
DELETE FROM config WHERE chave = 'syncUltimoPedido';
