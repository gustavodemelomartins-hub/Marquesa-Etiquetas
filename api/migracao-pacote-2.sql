-- Marquesa — Pacote 2: SKU comercial e estorno integral do Monte seu Colar
-- Data: 2026-09-07
--
-- Migration aditiva para bancos que já receberam migracao-pos-golive-1.sql.
-- Não executa em produção automaticamente. Aplicar somente pelo processo de
-- release autorizado e depois de backup/verificação do alvo.

-- A composição tinha apenas `base_sku`; por isso a linha comercial e a peça
-- física eram confundidas. NULL preserva vendas antigas, cuja leitura cai
-- para `base_sku` por compatibilidade.
ALTER TABLE venda_personalizacoes
  ADD COLUMN sku_comercial TEXT REFERENCES produtos(sku);

-- Toda composição da família usa a mesma base. O índice único anterior
-- impedia vender dois colares na mesma compra; a unicidade não é invariante.
DROP INDEX IF EXISTS idx_vpers_venda_base;
CREATE INDEX IF NOT EXISTS idx_vpers_venda_base
  ON venda_personalizacoes(venda_id, base_sku);

-- SKU de recibo para qualquer composição livre. Não representa estoque e
-- não tem preço: ambos pertencem à configuração congelada da venda.
INSERT OR IGNORE INTO produtos (sku, desc, cat, preco, qtd, status)
VALUES ('MONTE-COLAR', 'Monte seu Colar — composição livre', 'Colar', NULL, 0, 'inativo');
