-- Rollback de api/migracao-nuvemshop-fila.sql (§61).
--
-- Os gatilhos saem primeiro: sem eles, nenhum movimento novo escreve na
-- fila. As tabelas são só do envio para a loja (outbox e retrato da
-- conferência) — nenhum saldo, venda ou movimento mora nelas, então
-- apagá-las não perde estoque. Antes de rodar, publique o Worker anterior
-- ou desligue a sincronização (config.nuvemshopSyncAtivo = false).
DROP TRIGGER IF EXISTS trg_nuvemshop_fila_movimento;
DROP TRIGGER IF EXISTS trg_nuvemshop_fila_movimento_variacao;
DROP TRIGGER IF EXISTS trg_nuvemshop_fila_maleta_variacao_ins;
DROP TRIGGER IF EXISTS trg_nuvemshop_fila_maleta_variacao_del;
DROP TRIGGER IF EXISTS trg_nuvemshop_fila_anuncio;
DROP TABLE IF EXISTS nuvemshop_conferencia;
DROP TABLE IF EXISTS nuvemshop_fila;
