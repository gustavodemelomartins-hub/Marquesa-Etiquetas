-- ═══════════════════════════════════════════════════════════════════════
--  Fase 5.4d — o estorno de troca deixa de apagar o fato
-- ═══════════════════════════════════════════════════════════════════════
--
--  O QUE ESTAVA ERRADO
--
--  `estornarTroca` fazia `DELETE FROM garantia_trocas`. Sumiam o SKU novo,
--  o valor original, o valor considerado da peça nova, a data da troca e o
--  `movimento_id` que ligava a saída de estoque ao caso. Sobrava um evento
--  com três campos.
--
--  O próprio repositório já tinha a regra e o precedente. Em `saidas.js`:
--
--    "Estornar NÃO apaga. Um segundo movimento devolve a peça, e a linha
--     continua no histórico dizendo que houve, e que foi desfeita. Soft
--     delete sem rastro deixaria o estoque certo e a explicação perdida."
--
--  E três linhas acima do próprio DELETE, a mesma função CANCELA a venda da
--  diferença em vez de apagá-la, citando §28. A troca era o outlier.
--
--  O QUE MUDA
--
--  A linha ganha estado. Estornar passa a marcar, e não a remover: quem
--  olhar a garantia daqui a um ano vê que houve uma troca por 313860 no dia
--  10, que ela foi desfeita no dia 11, por quê, e qual movimento devolveu a
--  peça ao estoque.
--
--  O ÍNDICE ÚNICO
--
--  `idx_gar_troca_unica` era UNIQUE(garantia_id) e é o que impede dois
--  cliques de baixarem duas peças. Com a linha estornada permanecendo na
--  tabela, ele passaria a proibir a segunda troca legítima depois de um
--  estorno — que é justamente a razão de a rota de estorno existir.
--
--  Vira índice PARCIAL: único entre as trocas VIVAS. Uma garantia tem no
--  máximo uma troca ativa e quantas estornadas a história exigir. A trava
--  contra o duplo clique continua exatamente tão forte quanto era.
--
--  ROLLBACK
--
--    DROP INDEX idx_gar_troca_unica;
--    CREATE UNIQUE INDEX idx_gar_troca_unica ON garantia_trocas(garantia_id);
--
--  Só volte o índice cheio se NÃO houver garantia com mais de uma linha —
--  depois de um estorno seguido de troca nova, haverá, e o índice antigo
--  recusaria a criação. Nesse caso o caminho é decidir o que fazer com o
--  histórico, não forçar o índice. As colunas podem ficar: são aditivas.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. o estado da troca
--
-- Sem CHECK, pelo mesmo motivo de 5.2b: `ALTER TABLE` do SQLite não
-- acrescenta restrição de tabela, e um CHECK que só existisse no banco
-- criado do zero faria os dois caminhos divergirem em silêncio.
ALTER TABLE garantia_trocas ADD COLUMN estornada INTEGER NOT NULL DEFAULT 0;
ALTER TABLE garantia_trocas ADD COLUMN estorno_em TEXT;
ALTER TABLE garantia_trocas ADD COLUMN estorno_motivo TEXT;
-- O movimento que DEVOLVEU a peça nova ao estoque. Com ele, a linha explica
-- as duas pontas: `movimento_id` tirou a peça, `estorno_movimento_id` a
-- trouxe de volta, e a razão fecha com as duas visíveis.
ALTER TABLE garantia_trocas ADD COLUMN estorno_movimento_id INTEGER REFERENCES movimentos(id);

-- ─── 2. o índice único passa a valer só entre as trocas vivas
DROP INDEX IF EXISTS idx_gar_troca_unica;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gar_troca_unica
  ON garantia_trocas(garantia_id) WHERE estornada = 0;

-- O de venda continua cheio: a venda da diferença é criada uma vez por
-- troca, e a troca estornada guarda a dela (cancelada, nunca reaproveitada).
CREATE INDEX IF NOT EXISTS idx_gar_troca_estornada ON garantia_trocas(estornada);

-- ─── 3. nada a converter
--
-- As trocas que existem hoje estão todas vivas: as estornadas foram
-- apagadas pelo comportamento antigo e não há o que recuperar. `estornada`
-- nasce 0 pelo DEFAULT, que é a verdade sobre cada linha existente.
--
-- O que se perdeu antes desta migration está perdido, e isso não é
-- disfarçado: o evento `troca_estornada` em `garantia_eventos` continua
-- sendo o único rastro daqueles casos.
