-- DEC-2026-012: `sorteio` é uma categoria própria de saída sem faturamento.
--
-- ATENÇÃO: alterar CHECK no SQLite exige reconstruir tabela. Esta migration
-- contém DROP TABLE e é DESTRUTIVA NO SCHEMA, embora copie todas as linhas e
-- colunas antes da troca. Não executar automaticamente. Produção exige backup
-- conferido, bookmark de Time Travel, contagens antes/depois e aprovação humana.
--
-- Pré-condição: `migracao-saidas-sem-faturamento.sql` já aplicada.

CREATE TABLE saidas_sem_faturamento_sorteio_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('brinde', 'uso_proprio', 'perda', 'sorteio')),
  sentido TEXT NOT NULL DEFAULT 'saida' CHECK (sentido IN ('saida', 'entrada')),
  data TEXT NOT NULL,
  sku TEXT NOT NULL REFERENCES produtos(sku),
  variacao TEXT,
  variante_id TEXT,
  qtd INTEGER NOT NULL CHECK (qtd > 0),
  motivo TEXT,
  observacao TEXT,
  movimento_id INTEGER REFERENCES movimentos(id),
  estoque_refletido INTEGER NOT NULL DEFAULT 1 CHECK (estoque_refletido IN (0, 1)),
  origem_usuario TEXT,
  estornada INTEGER NOT NULL DEFAULT 0 CHECK (estornada IN (0, 1)),
  estorno_em TEXT,
  estorno_motivo TEXT,
  estorno_movimento_id INTEGER REFERENCES movimentos(id),
  origem_registro TEXT NOT NULL DEFAULT 'manual'
                  CHECK (origem_registro IN ('manual', 'migracao_historico')),
  historico_item_id INTEGER REFERENCES vendas_historico_itens(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT,
  CHECK (sentido = 'saida' OR tipo = 'perda'),
  CHECK (estornada = 0 OR estorno_em IS NOT NULL),
  CHECK (estoque_refletido = 1 OR movimento_id IS NULL),
  CHECK (estoque_refletido = 1 OR estorno_movimento_id IS NULL)
);

CREATE TABLE historico_reclassificacao_sorteio_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historico_item_id INTEGER NOT NULL REFERENCES vendas_historico_itens(id),
  classe_nova TEXT NOT NULL CHECK (classe_nova IN ('brinde', 'uso_proprio', 'perda', 'sorteio')),
  confianca TEXT NOT NULL CHECK (confianca IN ('alta', 'media', 'baixa')),
  motivo TEXT NOT NULL,
  saida_id INTEGER REFERENCES saidas_sem_faturamento_sorteio_nova(id),
  status TEXT NOT NULL DEFAULT 'proposta'
         CHECK (status IN ('proposta', 'aplicada', 'recusada')),
  decidido_em TEXT,
  decidido_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO saidas_sem_faturamento_sorteio_nova (
  id, tipo, sentido, data, sku, variacao, variante_id, qtd, motivo, observacao,
  movimento_id, estoque_refletido, origem_usuario, estornada, estorno_em,
  estorno_motivo, estorno_movimento_id, origem_registro, historico_item_id,
  criado_em, atualizado_em
)
SELECT
  id, tipo, sentido, data, sku, variacao, variante_id, qtd, motivo, observacao,
  movimento_id, estoque_refletido, origem_usuario, estornada, estorno_em,
  estorno_motivo, estorno_movimento_id, origem_registro, historico_item_id,
  criado_em, atualizado_em
FROM saidas_sem_faturamento;

INSERT INTO historico_reclassificacao_sorteio_nova (
  id, historico_item_id, classe_nova, confianca, motivo, saida_id, status,
  decidido_em, decidido_por, criado_em
)
SELECT
  id, historico_item_id, classe_nova, confianca, motivo, saida_id, status,
  decidido_em, decidido_por, criado_em
FROM historico_reclassificacao;

-- Aborta antes de qualquer DROP se uma cópia perder linhas. A constraint é o
-- freio executável; não depende de alguém perceber uma contagem no console.
CREATE TABLE migration_sorteio_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
INSERT INTO migration_sorteio_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM saidas_sem_faturamento_sorteio_nova)
    = (SELECT COUNT(*) FROM saidas_sem_faturamento)
  AND (SELECT COUNT(*) FROM historico_reclassificacao_sorteio_nova)
    = (SELECT COUNT(*) FROM historico_reclassificacao)
  THEN 1 ELSE 0 END;
DROP TABLE migration_sorteio_guard;

DROP TABLE historico_reclassificacao;
DROP TABLE saidas_sem_faturamento;
ALTER TABLE saidas_sem_faturamento_sorteio_nova RENAME TO saidas_sem_faturamento;
ALTER TABLE historico_reclassificacao_sorteio_nova RENAME TO historico_reclassificacao;

CREATE INDEX idx_ssf_data ON saidas_sem_faturamento(data);
CREATE INDEX idx_ssf_tipo ON saidas_sem_faturamento(tipo, estornada);
CREATE INDEX idx_ssf_sku ON saidas_sem_faturamento(sku);
CREATE UNIQUE INDEX idx_ssf_historico
  ON saidas_sem_faturamento(historico_item_id)
  WHERE historico_item_id IS NOT NULL;
CREATE UNIQUE INDEX idx_hrec_item
  ON historico_reclassificacao(historico_item_id);
CREATE INDEX idx_hrec_status ON historico_reclassificacao(status);

-- Validação obrigatória pós-troca:
-- SELECT tipo, COUNT(*) FROM saidas_sem_faturamento GROUP BY tipo;
-- SELECT classe_nova, COUNT(*) FROM historico_reclassificacao GROUP BY classe_nova;
-- SELECT COUNT(*) FROM produtos p
--   LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
--  WHERE p.qtd <> COALESCE(m.soma, 0);
