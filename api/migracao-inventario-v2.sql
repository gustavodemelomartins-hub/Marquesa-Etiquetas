-- Inventário reconstruído na V2 (06/10/2026, feedback da Sthefany).
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE
--
-- 1. `inventarios.numero` — o número que a Sthefany VÊ. O id técnico é
--    AUTOINCREMENT e nunca volta (é ele que as tabelas filhas citam); depois
--    dos inventários de teste apagados, o primeiro real aparecia como #12.
--    O número operacional é outro campo: começa em 1, segue a ordem de
--    abertura e é o que a tela e o histórico da peça mostram. O id continua
--    sendo a chave de tudo; nada é renumerado.
--    Preenchimento: os inventários que existem recebem 1, 2, 3… pela ordem
--    do id. Em PROD (06/10/2026) existe um só — o #12, pausado —, que vira
--    o Inventário #1.
--
-- 2. `inventario_leituras` — cada leitura (bipe, +1, −1, "todas aqui",
--    "nenhuma", trocar a variação de uma peça) vira uma linha, com o id que
--    a TELA gerou para ela. A chave única (inventario_id, leitura_id, sku,
--    variacao) é a trava contra contar duas vezes a mesma leitura quando a
--    rede falha e a tela tenta de novo. Também é o rastro do que aconteceu:
--    "bipou duas vezes sem querer" passa a ter como ser conferido.
--    A contagem continua em `inventario_contagem` (`contado` absoluto por
--    código/variação) — a leitura é o fato, a contagem é a soma dele.
--
-- 3. `inventario_resultado.partes_json` — para um código COM variação, a
--    diferença é medida no código inteiro (como na planilha dela), e o
--    fechamento congela aqui EM QUAL variação cada peça da diferença entra
--    na razão, quando ela disse (contou por variação). Sem isso a aplicação
--    teria de recalcular depois do fechamento — e o retrato deixaria de ser
--    retrato.
--
-- 4. `inventarios_excluidos.numero` — o número que o inventário excluído
--    tinha na tela, para o registro da exclusão continuar legível.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ESTOQUE: nada. Nenhuma coluna aqui é saldo; a razão continua sendo
-- `movimentos`. Aditiva. Rollback: api/migracao-inventario-v2-rollback.sql.

ALTER TABLE inventarios ADD COLUMN numero INTEGER;

UPDATE inventarios
   SET numero = (SELECT COUNT(*) FROM inventarios i2 WHERE i2.id <= inventarios.id)
 WHERE numero IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventarios_numero ON inventarios(numero);

CREATE TABLE IF NOT EXISTS inventario_leituras (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
  leitura_id    TEXT    NOT NULL,                  -- gerado pela tela, um por gesto
  sku           TEXT    NOT NULL REFERENCES produtos(sku),
  variacao      TEXT    NOT NULL DEFAULT '',       -- '' = variação não informada
  delta         INTEGER NOT NULL,                  -- assinado: +1 bipe, −1 desfazer…
  gesto         TEXT,                              -- bipe | mais | menos | todas | nenhuma | mover | criar | limpar
  em            TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (inventario_id, leitura_id, sku, variacao)
);
CREATE INDEX IF NOT EXISTS idx_inv_leituras ON inventario_leituras(inventario_id, sku);

ALTER TABLE inventario_resultado ADD COLUMN partes_json TEXT;

ALTER TABLE inventarios_excluidos ADD COLUMN numero INTEGER;
