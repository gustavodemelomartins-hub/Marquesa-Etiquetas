-- Preço de custo da peça — o valor que a Sthefany pagou, digitado por ela.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE
--
-- "Saiu sem faturar" contava PEÇAS: 5 brindes, 3 perdas. Faltava o dinheiro
-- — quanto aquilo custou. O sistema não guardava custo em lugar nenhum; o
-- único número de valor da peça era o preço de VENDA, e ele não pode ser
-- reaproveitado como custo (REGRAS §35: valor comercial não vira custo em
-- silêncio).
--
-- Este é o custo de REFERÊNCIA, o de hoje. A planilha de compras, a tela de
-- fornecedores e a margem líquida real vêm depois (roadmap, 27/09/2026) e
-- vão alimentar este mesmo campo — sem trocar o significado dele.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O QUE ELA CRIA
--
--   produtos.custo           REAL, NULL = custo não informado. Nunca 0 por
--                            omissão (§24): custo zero é afirmação, não falta.
--   produtos_custo_historico cada mudança do custo, com o valor anterior, o
--                            novo, quando, de onde e o motivo. Corrigir um
--                            custo não apaga o que ele era.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ESTOQUE: nada
--
-- Custo é atributo do cadastro, como o preço. Nenhum movimento é criado ou
-- lido aqui, e `produtos.qtd == SUM(movimentos.qtd)` não é tocado.
--
-- Não é idempotente: `ALTER TABLE ADD COLUMN` falha na segunda vez com
-- "duplicate column name". Rodar UMA vez por banco.

ALTER TABLE produtos ADD COLUMN custo REAL;

CREATE TABLE IF NOT EXISTS produtos_custo_historico (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  sku       TEXT NOT NULL REFERENCES produtos(sku),
  anterior  REAL,                                  -- NULL = não havia custo
  novo      REAL,                                  -- NULL = custo removido
  em        TEXT NOT NULL DEFAULT (datetime('now')),
  origem    TEXT NOT NULL DEFAULT 'ficha',         -- ficha | saida | planilha
  motivo    TEXT
);
CREATE INDEX IF NOT EXISTS idx_custo_hist_sku ON produtos_custo_historico(sku, em);
