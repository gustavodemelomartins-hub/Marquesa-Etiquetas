-- Idempotência forte do Apply do motor de reconciliação.
--
-- Liga um movimento ao item de reconciliação que o originou, e impede no
-- BANCO — não só em memória/JavaScript — que o MESMO item gere dois
-- movimentos. Fecha a janela: item aprovado → reivindicado → Worker morre
-- antes de gravar o movimento (ou duas execuções concorrentes disputam o
-- mesmo item). Ver docs/RECONCILIATION_ENGINE.md § Idempotência interna.
--
-- Roda DEPOIS de api/migracao-reconciliacao.sql (a FK aponta para
-- reconciliacao_itens, que só existe depois dela) e DEPOIS de
-- api/migracao-sync-seco.sql, se ainda não tiverem rodado. Nenhuma das três
-- depende de dado ter sido escrito pela outra — só de a TABELA existir.
--
-- NÃO idempotente (ALTER TABLE ADD COLUMN não é IF NOT EXISTS) — mesmo
-- padrão de migracao-variacoes.sql e migracao-sync-seco.sql. `movimentos`
-- já existe em produção com dado real: a coluna nasce NULL em toda linha
-- existente, e continua NULL para todo movimento que não vier da
-- reconciliação — a imensa maioria, hoje e sempre.
ALTER TABLE movimentos ADD COLUMN reconciliacao_item_id INTEGER REFERENCES reconciliacao_itens(id);

-- Índice único: no máximo UM movimento por item de reconciliação. SQLite
-- trata cada NULL como distinto de todo outro NULL num índice único, então
-- os movimentos sem reconciliacao_item_id (a imensa maioria) nunca colidem
-- entre si — só dois movimentos com o MESMO id não-nulo seriam recusados,
-- que é exatamente a proteção que falta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimentos_reconciliacao_item
  ON movimentos(reconciliacao_item_id);
