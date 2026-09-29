-- ══════════════════════════════════════════════════════════════════════════
-- Saída sem faturamento: o VALOR fica gravado na saída (29/09/2026)
--
-- POR QUE
--
-- "Saiu sem faturar" mostrava o valor de uma saída pelo preço e pelo custo
-- de HOJE da peça (REGRAS §46, versão de 27/09). Uma saída de abril ficava
-- explicada pelo preço de setembro: o 113626 saiu a R$ 129 na planilha e
-- hoje custa R$ 109. Decisão do Gustavo (29/09/2026): o lançamento guarda o
-- preço de venda e o custo daquele momento, e o passado não depende do
-- preço futuro.
--
-- O QUE ELA CRIA (aditiva — nenhuma linha é apagada, nenhum movimento é
-- criado ou tocado; `produtos.qtd == SUM(movimentos.qtd)` não muda)
--
--   saidas_sem_faturamento.preco_unit   preço de venda unitário da peça na
--                                       saída. NULL = não informado.
--   saidas_sem_faturamento.preco_fonte  de onde veio: lancamento | planilha
--                                       | manual.
--   saidas_sem_faturamento.custo_unit   custo unitário na saída. NULL = não
--                                       informado (nunca 0 por omissão, §24).
--   saidas_sem_faturamento.custo_fonte  lancamento | manual.
--   saidas_valor_historico              toda vez que um desses valores é
--                                       preenchido ou corrigido depois: o
--                                       anterior, o novo, de onde e por quê.
--
-- O HISTÓRICO ANTIGO
--
-- As saídas que vieram da planilha de vendas (`historico_item_id`) têm na
-- própria linha da planilha o preço unitário que a Sthefany registrou. Esse é
-- evidência, e é o único valor preenchido aqui — com uma linha de auditoria
-- cada. Linha cuja planilha diz 0 ou nada fica NULL: "valor não informado",
-- completável à mão pela tela, com motivo. Custo não tem fonte histórica
-- nenhuma (nenhuma peça tinha custo cadastrado) e fica NULL.
--
-- Não é idempotente: `ALTER TABLE ADD COLUMN` falha na segunda vez com
-- "duplicate column name". Rodar UMA vez por banco, antes do Worker novo.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE saidas_sem_faturamento ADD COLUMN preco_unit REAL;
ALTER TABLE saidas_sem_faturamento ADD COLUMN preco_fonte TEXT;
ALTER TABLE saidas_sem_faturamento ADD COLUMN custo_unit REAL;
ALTER TABLE saidas_sem_faturamento ADD COLUMN custo_fonte TEXT;

CREATE TABLE IF NOT EXISTS saidas_valor_historico (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  saida_id  INTEGER NOT NULL REFERENCES saidas_sem_faturamento(id),
  campo     TEXT NOT NULL CHECK (campo IN ('preco_unit', 'custo_unit')),
  anterior  REAL,                                  -- NULL = não havia valor
  novo      REAL,                                  -- NULL = valor removido
  fonte     TEXT NOT NULL,                         -- planilha | manual
  motivo    TEXT,
  em        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_saidas_valor_hist ON saidas_valor_historico(saida_id, em);

-- O preço que a planilha registrou, só onde ela registrou um preço.
UPDATE saidas_sem_faturamento
   SET preco_unit = (SELECT CAST(h.preco_unit_original AS REAL)
                       FROM vendas_historico_itens h
                      WHERE h.id = saidas_sem_faturamento.historico_item_id),
       preco_fonte = 'planilha'
 WHERE preco_unit IS NULL
   AND historico_item_id IS NOT NULL
   AND (SELECT CAST(h.preco_unit_original AS REAL)
          FROM vendas_historico_itens h
         WHERE h.id = saidas_sem_faturamento.historico_item_id) > 0;

INSERT INTO saidas_valor_historico (saida_id, campo, anterior, novo, fonte, motivo)
SELECT s.id, 'preco_unit', NULL, s.preco_unit, 'planilha',
       'Preço unitário da linha ' || COALESCE(h.origem_linha, '?') || ' da planilha de vendas'
  FROM saidas_sem_faturamento s
  JOIN vendas_historico_itens h ON h.id = s.historico_item_id
 WHERE s.preco_fonte = 'planilha';
