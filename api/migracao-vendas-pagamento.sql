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
--   pago            1 | 0. O default do ALTER TABLE é 1 porque é o que o
--                   sistema já assumia de toda venda operacional — mas o
--                   default não é a palavra final: o backfill logo abaixo
--                   volta para 0 toda venda que tem evidência de pendência.
--                   Uma conta a receber real nunca vira pagamento por
--                   causa de uma migration.
--   data_pagamento  quando o dinheiro entrou. O backfill NÃO copia `data`
--                   cegamente: ele classifica cada venda pela evidência que
--                   já existe no banco (ver o bloco do backfill abaixo).
--                   Onde não há evidência nenhuma, a data da venda entra
--                   como aproximação DECLARADA, nunca como fato.
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
-- De ONDE veio a data de pagamento. Sem CHECK de propósito: `ALTER TABLE`
-- no SQLite não sabe acrescentar CHECK, e o banco criado do zero por
-- `schema.sql` precisa terminar idêntico a este. Valores gravados:
--
--   informado             um humano disse a data. É a única que é FATO.
--   historico_paga        a cobrança histórica ligada a esta venda foi
--                         marcada paga, e a data veio de `ho.paga_em`.
--   historico_aberto      a cobrança ligada a esta venda está ABERTA:
--                         a venda nasce NÃO PAGA, sem data.
--   legado_data_venda     não há evidência nenhuma no banco. A data da
--                         venda é usada como APROXIMAÇÃO para preservar o
--                         comportamento financeiro antigo — inferida, não
--                         conhecida.
--   indeterminado_site  idem, mas o pedido veio do site, e o site aceita
--                         pedido com pagamento pendente. O banco nunca
--                         guardou `payment_status`, então o estado real é
--                         DESCONHECIDO e a linha entra no relatório de
--                         conferência humana.
ALTER TABLE vendas ADD COLUMN pagamento_origem TEXT;

-- ─────────────────────────────────────────────────────── o backfill, por prova
--
-- O backfill NÃO é "marque tudo como pago". Uma conta a receber de verdade
-- não pode virar pagamento por causa de uma migration, então cada linha é
-- classificada pela evidência que EXISTE no banco, nesta ordem:

-- 1) EVIDÊNCIA DE PENDÊNCIA — a venda operacional está amarrada a uma
--    operação histórica com cobrança ABERTA. Isso é uma conta a receber
--    real, e ela continua a receber.
UPDATE vendas
   SET pago = 0, data_pagamento = NULL, pagamento_origem = 'historico_aberto'
 WHERE id IN (
   SELECT hov.venda_id
     FROM historico_operacao_vendas hov
     JOIN historico_operacoes ho ON ho.id = hov.operacao_id
    WHERE hov.status_registro = 'ativa' AND ho.status_registro = 'ativa'
      AND ho.cobranca_status = 'aberta');

-- 2) EVIDÊNCIA DE PAGAMENTO COM DATA REAL — a cobrança foi marcada paga e
--    guardou `paga_em`. Esta é a única data de pagamento herdada que é um
--    fato, e não uma aproximação.
UPDATE vendas
   SET pago = 1,
       data_pagamento = (
         SELECT date(ho.paga_em)
           FROM historico_operacao_vendas hov
           JOIN historico_operacoes ho ON ho.id = hov.operacao_id
          WHERE hov.venda_id = vendas.id AND hov.status_registro = 'ativa'
            AND ho.status_registro = 'ativa' AND ho.cobranca_status = 'paga'
            AND ho.paga_em IS NOT NULL
          ORDER BY ho.id DESC LIMIT 1),
       pagamento_origem = 'historico_paga'
 WHERE pagamento_origem IS NULL
   AND EXISTS (
     SELECT 1 FROM historico_operacao_vendas hov
       JOIN historico_operacoes ho ON ho.id = hov.operacao_id
      WHERE hov.venda_id = vendas.id AND hov.status_registro = 'ativa'
        AND ho.status_registro = 'ativa' AND ho.cobranca_status = 'paga'
        AND ho.paga_em IS NOT NULL);

-- 3) INDETERMINADO — pedido do site. A Nuvemshop aceita pedido com
--    pagamento pendente e a sincronização nunca guardou `payment_status`:
--    o banco não sabe. O comportamento financeiro antigo é preservado
--    (a venda já era contada no dia da venda), mas a linha fica CARIMBADA
--    como indeterminada e sai no relatório de conferência.
UPDATE vendas
   SET data_pagamento = data, pagamento_origem = 'indeterminado_site'
 WHERE pagamento_origem IS NULL AND origem = 'site';

-- 4) LEGADO SEM EVIDÊNCIA — balcão e acerto. Nenhuma informação de
--    pagamento jamais existiu para estas linhas; o sistema sempre as contou
--    como pagas no dia da venda. A data da venda entra como APROXIMAÇÃO
--    declarada, e é isso que `legado_data_venda` diz.
UPDATE vendas
   SET data_pagamento = data, pagamento_origem = 'legado_data_venda'
 WHERE pagamento_origem IS NULL;

-- O faturamento passa a ser recortado por esta data, então ela precisa de
-- índice pelo mesmo motivo que `idx_vendas_data` existe.
CREATE INDEX IF NOT EXISTS idx_vendas_pagamento ON vendas(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_vendas_pago      ON vendas(pago, data);
-- O relatório de conferência procura por procedência: sem índice ele varre
-- `vendas` inteira toda vez que alguém pergunta "o que ficou indeterminado?".
CREATE INDEX IF NOT EXISTS idx_vendas_pgorigem  ON vendas(pagamento_origem);
