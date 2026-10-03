-- Inventário "bipou e marcha" e a correção auditável de uma reclassificação.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE (02/10/2026)
--
-- 1. A Sthefany não conta peça por peça. O sistema já sabe quanto deveria
--    haver em casa; ela bipa a referência UMA vez para dizer "conferi" e só
--    digita quando falta — e só QUANTO falta. `contado` continua sendo o
--    número que a comparação usa (esperado − faltando), mas o gesto dela
--    precisa ficar registrado como ela o fez:
--
--      esperado_na_hora  o "esperado em casa" que o servidor usou no bipe;
--      faltando          o que ela disse que faltava (0 = conferido).
--
--    Os dois ficam NULL quando a linha foi contada do jeito antigo
--    (`contado` absoluto, dashboard clássico ou campo digitado).
--
-- 2. `inventario_eventos` — o que aconteceu DURANTE a contagem que não é
--    contagem: a variação cadastrada sem sair do inventário. O fechamento
--    precisa conseguir dizer "duas variações foram criadas nesta sessão".
--
-- 3. `historico_reclassificacao_correcoes` — a classe de uma linha já
--    reclassificada passou a poder ser CORRIGIDA (a planilha "Saiu sem
--    faturar" da Sthefany vence a classificação automática). A decisão
--    original não é apagada: cada correção guarda a classe e o motivo
--    anteriores, a nova classe, a fonte e quando.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ESTOQUE: nada. Nenhuma coluna aqui é saldo e nenhuma tabela é razão.
--
-- `ALTER TABLE ... ADD COLUMN` não é idempotente: "duplicate column name"
-- significa que esta migration já foi aplicada.

ALTER TABLE inventario_contagem ADD COLUMN esperado_na_hora INTEGER;
ALTER TABLE inventario_contagem ADD COLUMN faltando INTEGER CHECK (faltando IS NULL OR faltando >= 0);

CREATE TABLE IF NOT EXISTS inventario_eventos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  tipo          TEXT    NOT NULL CHECK (tipo IN ('variacao_criada')),
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  variacao      TEXT,
  detalhe       TEXT,
  em            TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_eventos ON inventario_eventos(inventario_id);

CREATE TABLE IF NOT EXISTS historico_reclassificacao_correcoes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  reclassificacao_id  INTEGER NOT NULL REFERENCES historico_reclassificacao(id),
  classe_anterior     TEXT    NOT NULL,
  classe_nova         TEXT    NOT NULL CHECK (classe_nova IN ('brinde', 'uso_proprio', 'perda', 'sorteio')),
  motivo_anterior     TEXT,
  motivo              TEXT    NOT NULL,
  observacao          TEXT,
  custo_informado     REAL,
  fonte               TEXT    NOT NULL,
  saida_id            INTEGER REFERENCES saidas_sem_faturamento(id),
  decidido_por        TEXT,
  em                  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reclass_correcoes ON historico_reclassificacao_correcoes(reclassificacao_id);
