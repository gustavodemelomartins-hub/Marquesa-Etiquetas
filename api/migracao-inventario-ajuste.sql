-- Diferença de inventário é AJUSTE, não perda — e inventário sem efeito pode
-- ser excluído, com registro.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE (05/10/2026, feedback da Sthefany)
--
-- 1. Até aqui toda diferença aplicada pela revisão do inventário virava uma
--    saída `perda` em `saidas_sem_faturamento` — inclusive a SOBRA. Mas
--    inventário existe justamente para reconciliar o sistema com o físico:
--    a diferença pode ser erro histórico, entrada duplicada, cadastro errado
--    ou movimento não lançado. "Perda" passou a ser uma classe que ela
--    ESCOLHE; o resto vira um movimento `ajuste` com origem `inventario`.
--
--    `inventario_ajustes` é o registro desse ajuste: qual linha do retrato,
--    quanto, com que motivo. A chave primária é a trava contra aplicar a
--    mesma linha duas vezes (duas abas, crash e retry) — o mesmo papel que o
--    índice `idx_saida_inventario_unica` cumpre para a perda. O INSERT entra
--    no MESMO batch do movimento: conflito na chave desfaz os dois.
--
-- 2. `inventarios_excluidos` — ela pediu para apagar inventários de teste.
--    Só é excluível o inventário que NÃO mexeu em estoque (nenhuma linha
--    aplicada, nenhuma saída, nenhum ajuste). A exclusão apaga as linhas de
--    contagem, mas o fato de ele ter existido fica aqui: quando, em que
--    situação, quantas leituras e quais variações foram criadas durante a
--    contagem (essas continuam no cadastro da peça).
--
-- ─────────────────────────────────────────────────────────────────────────
-- ESTOQUE: nada. Nenhuma coluna aqui é saldo; a razão continua sendo
-- `movimentos`. Aditiva e idempotente (IF NOT EXISTS): roda duas vezes.
-- Rollback: api/migracao-inventario-ajuste-rollback.sql.

CREATE TABLE IF NOT EXISTS inventario_ajustes (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  variacao      TEXT    NOT NULL DEFAULT '',
  qtd           INTEGER NOT NULL CHECK (qtd <> 0),   -- assinado: − falta, + sobra
  motivo        TEXT    NOT NULL,                    -- o rótulo que ela escolheu
  observacao    TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (inventario_id, sku, variacao)
);

CREATE TABLE IF NOT EXISTS inventarios_excluidos (
  inventario_id INTEGER PRIMARY KEY,                 -- o id que existiu; não volta a ser usado
  status        TEXT    NOT NULL,                    -- a situação no momento da exclusão
  iniciado_em   TEXT,
  concluido_em  TEXT,
  leituras      INTEGER NOT NULL DEFAULT 0,          -- linhas de contagem apagadas
  pecas         INTEGER NOT NULL DEFAULT 0,          -- soma do contado nessas linhas
  eventos_json  TEXT    NOT NULL DEFAULT '[]',       -- variações criadas na contagem
  motivo        TEXT,
  excluido_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);
