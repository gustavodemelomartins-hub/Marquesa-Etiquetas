-- ═══════════════════════════════════════════════════════════════════════════
-- §29 — a data da venda e a data do pagamento são duas datas diferentes
--
-- O defeito: uma venda "A Receber" marcada como paga não entrava no
-- faturamento do mês em que o dinheiro chegou. `vendas` só tinha `data`, e
-- `cteVendas` tratava TODA venda operacional como paga no dia da venda.
-- Vender em julho e receber em setembro não tinha como ser dito.
--
-- Três colunas, e nenhuma delas reescreve o passado:
--
--   pago            1 | 0. Default 1 porque é o que o sistema já assumia:
--                   toda venda existente era contada como paga. Mudar o
--                   default para 0 aqui apagaria faturamento de verdade.
--   data_pagamento  quando o dinheiro entrou. O backfill copia `data` nas
--                   vendas que já existem, pelo mesmo motivo: elas já eram
--                   contadas no mês da venda, e a migration não pode mover
--                   faturamento de mês.
--   observacao      "Maleta", "Feira", "Grupo VIP". Texto livre, da venda
--                   inteira — o desconto por peça continua em `venda_itens`.
--
-- IDEMPOTENTE não é possível com ALTER TABLE ADD COLUMN no SQLite: rodar
-- duas vezes devolve "duplicate column name". Esse erro é o sinal de que a
-- migration JÁ ESTÁ aplicada — não é sucesso, e não é dano.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE vendas ADD COLUMN pago INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vendas ADD COLUMN data_pagamento TEXT;
ALTER TABLE vendas ADD COLUMN observacao TEXT;

-- O backfill que garante "nenhum número muda hoje": toda venda que já
-- existia continua paga no dia em que foi vendida.
UPDATE vendas SET data_pagamento = data WHERE data_pagamento IS NULL AND pago = 1;

-- O faturamento passa a ser recortado por esta data, então ela precisa de
-- índice pelo mesmo motivo que `idx_vendas_data` existe.
CREATE INDEX IF NOT EXISTS idx_vendas_pagamento ON vendas(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_vendas_pago      ON vendas(pago, data);
